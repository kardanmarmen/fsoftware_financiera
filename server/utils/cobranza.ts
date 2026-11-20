import { and, eq, sql } from 'drizzle-orm'
import { clientes, creditos, moras, type Usuario, usuarios } from '../db/esquema'

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
 * morosidad. Lee solo los créditos vigentes y sus moras, no el calendario (ver situacionDelCredito):
 * con 3,000 créditos son ~3,000 filas leídas en lugar de ~50,000, importante para el límite diario de D1.
 */
export async function situacionCobranza(db: BaseDatos, actor: Usuario, hoy = hoyEnMexico()) {
  const ambito = and(eq(creditos.estado, 'aceptado'), ambitoCreditos(actor))
  const [lista, listaMoras] = await Promise.all([
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
        totalCentavos: creditos.totalCentavos,
        pagoSemanalCentavos: creditos.pagoSemanalCentavos,
        plazoSemanas: creditos.plazoSemanas,
        fechaDesembolso: creditos.fechaDesembolso,
        moraSemanalCentavos: creditos.moraSemanalCentavos,
      })
      .from(creditos)
      .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(ambito),
    db
      .select({
        creditoId: moras.creditoId,
        semana: moras.semana,
        pendienteCentavos: sql<number>`${moras.montoCentavos} - ${moras.pagadoCentavos} - ${moras.condonadoCentavos}`,
      })
      .from(moras)
      .innerJoin(creditos, eq(moras.creditoId, creditos.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(ambito),
  ])

  const morasPorCredito = new Map<string, { semana: number, pendienteCentavos: number }[]>()
  for (const m of listaMoras) morasPorCredito.set(m.creditoId, [...(morasPorCredito.get(m.creditoId) ?? []), m])
  const enSieteDias = sumarDias(hoy, 6)

  return lista
    .map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, totalCentavos, plazoSemanas, fechaDesembolso, ...c }) => {
      const s = situacionDelCredito({ ...c, totalCentavos, plazoSemanas, fechaDesembolso }, hoy)
      const generadas = morasPorCredito.get(c.id) ?? []
      // Semanas vencidas sin cubrir cuya mora aún no se genera (se genera al abrir el crédito o al cobrar)
      const sinMora = s.semanasVencidas - generadas.filter((m) => m.semana > s.semanasCompletas && m.semana <= s.semanasCompletas + s.semanasVencidas).length
      const moraPendienteCentavos = generadas.reduce((t, m) => t + Number(m.pendienteCentavos), 0) + sinMora * c.moraSemanalCentavos
      const diasAtraso = diasDeAtraso(s.proximoVencimiento, hoy)
      const estado: EstadoCobranza = diasAtraso > 0
        ? 'atrasado'
        : s.proximoVencimiento === hoy
          ? 'vence_hoy'
          : s.proximoVencimiento && s.proximoVencimiento <= enSieteDias ? 'esta_semana' : 'al_corriente'
      return {
        ...c,
        clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
        proximoVencimiento: s.proximoVencimiento,
        semanasVencidas: s.semanasVencidas,
        vencidoCentavos: s.vencidoCentavos,
        moraPendienteCentavos,
        // Lo que debería cobrarse hoy para quedar al corriente
        porCobrarHoyCentavos: s.vencidoCentavos + s.venceHoyCentavos + moraPendienteCentavos,
        diasAtraso,
        estado,
        morosidad: nivelMorosidad(diasAtraso),
      }
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso || (a.proximoVencimiento ?? '').localeCompare(b.proximoVencimiento ?? ''))
}
