import { type SQL, and, eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { calendarioPagos, clientes, creditos, folios, operaciones, type Usuario, usuarios } from '../db/esquema'

/**
 * Busca el crédito del parámetro `:id` y verifica que el actor pueda verlo. Mismo ámbito que los
 * clientes: Cobrador, sus créditos; Gerente, los de sus Cobradores; Administrador, todos.
 * Responde 404 también sin permiso, para no revelar que el crédito existe.
 */
export async function obtenerCreditoObjetivo(event: H3Event, actor: Usuario) {
  const id = getRouterParam(event, 'id') ?? ''
  const fila = await usarBd(event)
    .select({
      credito: creditos,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: usuarios.nombre,
      gerenteId: usuarios.gerenteId,
    })
    .from(creditos)
    .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
    .where(eq(creditos.id, id))
    .get()

  const puedeVer = fila && (
    actor.rol === 'administrador'
    || (actor.rol === 'cobrador' && fila.credito.cobradorId === actor.id)
    || (actor.rol === 'gerente' && fila.gerenteId === actor.id)
  )
  if (!puedeVer) throw createError({ statusCode: 404, message: 'Crédito no encontrado' })
  return fila
}

/** Desembolsan, cobran y liquidan el Cobrador y su Gerente; el Administrador solo consulta. */
export function puedeOperarCredito(actor: Usuario) {
  return actor.rol === 'gerente' || actor.rol === 'cobrador'
}

/** Rechaza la petición si el actor no puede operar el crédito o este no está en `estado`. */
export function exigirEstado(actor: Usuario, estadoActual: string, estado: string, mensaje: string) {
  if (!puedeOperarCredito(actor)) throw createError({ statusCode: 403, message: 'No tienes permiso para esta acción' })
  if (estadoActual !== estado) throw createError({ statusCode: 409, message: mensaje })
}

/**
 * Consultas para tomar el siguiente folio de una serie (RF113), solo si se cumple `condicion`.
 * Van al inicio del mismo db.batch() que la operación: así el número no se salta si la operación
 * no se guarda, y dos operaciones simultáneas nunca reciben el mismo folio.
 * El folio queda en `folios.ultimo` y se lee con `folioActual(serie)` dentro del mismo batch.
 */
export function tomarFolio(event: H3Event, serie: 'CR' | 'OP', condicion: SQL) {
  const db = usarBd(event)
  return [
    db.insert(folios).values({ serie, ultimo: 0 }).onConflictDoNothing(),
    db.update(folios).set({ ultimo: sql`${folios.ultimo} + 1` }).where(and(eq(folios.serie, serie), condicion)),
  ] as const
}

/** "OP-000042": expresión SQL con el folio que se acaba de tomar. */
export function folioActual(serie: 'CR' | 'OP') {
  return sql`${serie} || '-' || substr('000000' || (SELECT ultimo FROM folios WHERE serie = ${serie}), -6)`
}

interface NuevaOperacion {
  id: string
  creditoId: string
  tipo: 'desembolso' | 'pago' | 'abono' | 'liquidacion'
  semana: number | null
  montoCentavos: number
  saldoResultanteCentavos: number
  claveIdempotencia: string
  registradoPor: string
  registradoEn: number
}

/**
 * Inserta una operación solo si el crédito sigue como se leyó (`condicion` sobre `creditos`).
 * Si otra persona registró algo antes, no se inserta nada y las consultas que dependen de
 * `seGuardo(op.id)` tampoco se aplican: la operación completa queda sin efecto (RNF05).
 */
export function insertarOperacion(event: H3Event, op: NuevaOperacion, condicion: SQL) {
  return insertarSi(
    usarBd(event),
    operaciones,
    { ...op, folio: folioActual('OP'), operacionCorregidaId: null, motivo: null },
    creditos,
    and(eq(creditos.id, op.creditoId), condicion)!,
  )
}

/** Condición para usar fuera de `creditos`: el crédito `id` existe y cumple `condicion`. */
export function sigueIgualSql(id: string, condicion: SQL) {
  return sql`EXISTS (SELECT 1 FROM ${creditos} WHERE ${creditos.id} = ${id} AND ${condicion})`
}

/** Condición: la operación `id` se guardó (para las consultas que van después en el batch). */
export function seGuardo(id: string) {
  return sql`EXISTS (SELECT 1 FROM operaciones WHERE id = ${id})`
}

/**
 * Si la clave de idempotencia ya existe, el envío es un reintento de una operación guardada:
 * regresa su id para mostrar el mismo comprobante en lugar de registrarla dos veces (RN-24).
 */
export async function operacionPorClave(event: H3Event, creditoId: string, clave: string) {
  const op = await usarBd(event)
    .select({ id: operaciones.id })
    .from(operaciones)
    .where(and(eq(operaciones.claveIdempotencia, clave), eq(operaciones.creditoId, creditoId)))
    .get()
  return op?.id ?? null
}

/**
 * Registra un pago o abono (RF64–RF68) y, si deja el saldo en cero, liquida el crédito (RF97–RF99).
 * Todo va en una transacción: la operación con su folio, el saldo, las semanas cubiertas y la bitácora.
 * Si otra persona registró un pago mientras tanto (el saldo ya no es el que se leyó), no se guarda nada.
 */
export async function registrarPago(
  event: H3Event,
  actor: Usuario,
  credito: typeof creditos.$inferSelect,
  montoCentavos: number,
  claveIdempotencia: string,
) {
  const db = usarBd(event)
  const calendario = await db
    .select({ semana: calendarioPagos.semana, montoCentavos: calendarioPagos.montoCentavos, cubiertoCentavos: calendarioPagos.cubiertoCentavos, fechaVencimiento: calendarioPagos.fechaVencimiento })
    .from(calendarioPagos)
    .where(eq(calendarioPagos.creditoId, credito.id))

  if (montoCentavos > credito.saldoCentavos) {
    throw createError({
      statusCode: 400,
      message: `El monto es mayor que el saldo pendiente (${formatearDinero(credito.saldoCentavos)})`,
    })
  }
  const pago = aplicarPago(calendario, montoCentavos)
  const saldo = credito.saldoCentavos - montoCentavos
  const liquida = saldo === 0
  // Anticipada si se liquida antes del vencimiento de la última semana
  const ultimoVencimiento = calendario.reduce((max, s) => (s.fechaVencimiento > max ? s.fechaVencimiento : max), '')
  const tipoLiquidacion = hoyEnMexico() < ultimoVencimiento ? 'anticipada' as const : 'normal' as const

  const ahora = Date.now()
  const opId = crypto.randomUUID()
  const sigueIgual = and(eq(creditos.estado, 'aceptado'), eq(creditos.saldoCentavos, credito.saldoCentavos))!

  const [, , insercion] = await db.batch([
    ...tomarFolio(event, 'OP', sigueIgualSql(credito.id, sigueIgual)),
    insertarOperacion(event, {
      id: opId,
      creditoId: credito.id,
      tipo: liquida ? 'liquidacion' : pago.tipo,
      semana: pago.semana,
      montoCentavos,
      saldoResultanteCentavos: saldo,
      claveIdempotencia,
      registradoPor: actor.id,
      registradoEn: ahora,
    }, sigueIgual),
    db
      .update(creditos)
      .set({
        saldoCentavos: saldo,
        actualizadoEn: ahora,
        ...(liquida ? { estado: 'liquidado' as const, liquidadoEn: ahora, tipoLiquidacion } : {}),
      })
      .where(and(eq(creditos.id, credito.id), seGuardo(opId))),
    ...pago.cambios.map((c) =>
      db
        .update(calendarioPagos)
        .set({ cubiertoCentavos: c.cubiertoCentavos })
        .where(and(eq(calendarioPagos.creditoId, credito.id), eq(calendarioPagos.semana, c.semana), seGuardo(opId)))),
    eventoBitacoraSi(
      event,
      {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: liquida ? 'credito_liquidado' : 'pago_registrado',
        entidad: 'credito',
        entidadId: credito.id,
        detalle: { operacionId: opId, montoCentavos, saldoCentavos: saldo, ...(liquida ? { tipoLiquidacion } : {}) },
      },
      operaciones,
      eq(operaciones.id, opId),
    ),
  ])
  if (insercion.meta.changes === 0) {
    throw createError({
      statusCode: 409,
      message: 'Se registró otro movimiento en este crédito mientras capturabas. Recarga la página y revisa el saldo.',
    })
  }
  return { operacionId: opId }
}
