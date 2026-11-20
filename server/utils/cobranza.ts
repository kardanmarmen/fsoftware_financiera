import { and, eq, sql } from 'drizzle-orm'
import { calendarioPagos, clientes, creditos, moras, type Usuario, usuarios } from '../db/esquema'

const DIA_MS = 24 * 60 * 60 * 1000

// Inicio de un día (AAAA-MM-DD) en hora del centro de México, en milisegundos (como en la bitácora).
// México no tiene horario de verano desde 2022: siempre es UTC-6.
export const inicioDelDia = (fecha: string) => Date.parse(`${fecha}T00:00:00-06:00`)
export const finDelDia = (fecha: string) => inicioDelDia(fecha) + DIA_MS

/** Créditos que el actor puede ver: Cobrador, los suyos; Gerente, los de sus Cobradores; Administrador, todos. */
export function ambitoCreditos(actor: Usuario) {
  if (actor.rol === 'cobrador') return eq(creditos.cobradorId, actor.id)
  if (actor.rol === 'gerente') return eq(usuarios.gerenteId, actor.id) // requiere el join con el Cobrador
  return undefined
}

export const ESTADOS_COBRANZA = ['atrasado', 'vence_hoy', 'esta_semana', 'al_corriente'] as const
export type EstadoCobranza = (typeof ESTADOS_COBRANZA)[number]

/**
 * RF73–RF78, RNF26: situación de cobro de los créditos vigentes del actor: próximo vencimiento, lo que
 * ya venció sin pagarse, días de atraso, mora pendiente (incluida la que aún no se genera) y nivel de
 * morosidad. Se calcula con dos consultas agrupadas, sin leer el calendario completo de cada crédito.
 */
export async function situacionCobranza(db: BaseDatos, actor: Usuario, hoy = hoyEnMexico()) {
  const ambito = and(eq(creditos.estado, 'aceptado'), ambitoCreditos(actor))
  const vence = calendarioPagos.fechaVencimiento
  const falta = sql`${calendarioPagos.montoCentavos} - ${calendarioPagos.cubiertoCentavos}`

  const [lista, semanas, morasGeneradas] = await Promise.all([
    db
      .select({
        id: creditos.id,
        folio: creditos.folio,
        clienteId: creditos.clienteId,
        clienteNombre: clientes.nombre,
        clienteApellidoPaterno: clientes.apellidoPaterno,
        clienteApellidoMaterno: clientes.apellidoMaterno,
        telefono: clientes.telefono,
        cobradorNombre: usuarios.nombre,
        saldoCentavos: creditos.saldoCentavos,
        pagoSemanalCentavos: creditos.pagoSemanalCentavos,
        moraSemanalCentavos: creditos.moraSemanalCentavos,
      })
      .from(creditos)
      .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(ambito),
    // Semanas sin cubrir, agrupadas por crédito
    db
      .select({
        creditoId: calendarioPagos.creditoId,
        proximoVencimiento: sql<string>`MIN(${vence})`,
        semanasVencidas: sql<number>`SUM(CASE WHEN ${vence} < ${hoy} THEN 1 ELSE 0 END)`,
        vencidoCentavos: sql<number>`SUM(CASE WHEN ${vence} < ${hoy} THEN ${falta} ELSE 0 END)`,
        venceHoyCentavos: sql<number>`SUM(CASE WHEN ${vence} = ${hoy} THEN ${falta} ELSE 0 END)`,
        // Semanas vencidas cuya mora aún no se genera (se genera al abrir el crédito o al cobrar)
        sinMora: sql<number>`SUM(CASE WHEN ${vence} < ${hoy} AND NOT EXISTS (
          SELECT 1 FROM ${moras} WHERE ${moras.creditoId} = ${calendarioPagos.creditoId} AND ${moras.semana} = ${calendarioPagos.semana}
        ) THEN 1 ELSE 0 END)`,
      })
      .from(calendarioPagos)
      .innerJoin(creditos, eq(calendarioPagos.creditoId, creditos.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(and(ambito, sql`${calendarioPagos.cubiertoCentavos} < ${calendarioPagos.montoCentavos}`))
      .groupBy(calendarioPagos.creditoId),
    db
      .select({
        creditoId: moras.creditoId,
        pendienteCentavos: sql<number>`SUM(${moras.montoCentavos} - ${moras.pagadoCentavos} - ${moras.condonadoCentavos})`,
      })
      .from(moras)
      .innerJoin(creditos, eq(moras.creditoId, creditos.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(ambito)
      .groupBy(moras.creditoId),
  ])

  const porCredito = new Map(semanas.map((s) => [s.creditoId, s]))
  const moraPorCredito = new Map(morasGeneradas.map((m) => [m.creditoId, Number(m.pendienteCentavos)]))
  const enSieteDias = sumarDias(hoy, 6)

  return lista
    .map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, ...c }) => {
      const s = porCredito.get(c.id)
      const moraPendienteCentavos = (moraPorCredito.get(c.id) ?? 0) + Number(s?.sinMora ?? 0) * c.moraSemanalCentavos
      const diasAtraso = diasDeAtraso(s?.proximoVencimiento, hoy)
      const estado: EstadoCobranza = diasAtraso > 0
        ? 'atrasado'
        : s?.proximoVencimiento === hoy
          ? 'vence_hoy'
          : s && s.proximoVencimiento <= enSieteDias ? 'esta_semana' : 'al_corriente'
      return {
        ...c,
        clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
        proximoVencimiento: s?.proximoVencimiento ?? null,
        semanasVencidas: Number(s?.semanasVencidas ?? 0),
        vencidoCentavos: Number(s?.vencidoCentavos ?? 0),
        moraPendienteCentavos,
        // Lo que debería cobrarse hoy para quedar al corriente
        porCobrarHoyCentavos: Number(s?.vencidoCentavos ?? 0) + Number(s?.venceHoyCentavos ?? 0) + moraPendienteCentavos,
        diasAtraso,
        estado,
        morosidad: nivelMorosidad(diasAtraso),
      }
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso || (a.proximoVencimiento ?? '').localeCompare(b.proximoVencimiento ?? ''))
}
