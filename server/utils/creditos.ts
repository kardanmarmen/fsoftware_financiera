import { type SQL, and, eq, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { H3Event } from 'h3'
import { calendarioPagos, clientes, creditos, folios, moras, operaciones, type Usuario, usuarios } from '../db/esquema'

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
  moraCentavos?: number
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
    { moraCentavos: 0, ...op, folio: folioActual('OP'), operacionCorregidaId: null, motivo: null },
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

type Credito = typeof creditos.$inferSelect

/** "Se registró otro movimiento…": la operación no se guardó porque el crédito cambió mientras tanto. */
export const errorCreditoCambio = () => createError({
  statusCode: 409,
  message: 'Se registró otro movimiento en este crédito mientras capturabas. Recarga la página y revisa el saldo.',
})

/** Ejecuta las consultas de una operación y revisa que se haya guardado. */
export async function ejecutarOperacion(event: H3Event, preparada: { consultas: BatchItem<'sqlite'>[], indiceInsercion: number, opId: string }) {
  const resultados = await usarBd(event).batch(preparada.consultas as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  if ((resultados[preparada.indiceInsercion] as { meta: { changes: number } }).meta.changes === 0) throw errorCreditoCambio()
  return { operacionId: preparada.opId }
}

/**
 * Prepara un pago o abono (RF64–RF68): primero cubre las moras pendientes (RF76) y el resto se reparte
 * entre las semanas. Si deja el saldo en cero, liquida el crédito (RF97–RF99).
 * Las consultas van en una sola transacción: moras nuevas, folio, operación, saldo, semanas, moras
 * pagadas y bitácora. Si otra persona registró algo mientras tanto (el crédito ya no es como se leyó),
 * no se guarda nada. `condicionExtra` permite atar el pago a otra operación (renovación, RF86).
 */
export async function prepararPago(
  event: H3Event,
  actor: Usuario,
  credito: Credito,
  montoCentavos: number | 'todo',
  claveIdempotencia: string,
  condicionExtra?: SQL,
) {
  const db = usarBd(event)
  const ahora = Math.max(Date.now(), credito.actualizadoEn + 1)
  const { calendario, moras: listaMoras, nuevas, moraPendienteCentavos } = await leerCalendarioYMoras(db, credito)

  const adeudo = credito.saldoCentavos + moraPendienteCentavos
  const monto = montoCentavos === 'todo' ? adeudo : montoCentavos
  if (monto > adeudo) {
    throw createError({
      statusCode: 400,
      message: `El monto es mayor que el adeudo total (${formatearDinero(adeudo)}${moraPendienteCentavos ? `, con ${formatearDinero(moraPendienteCentavos)} de mora` : ''})`,
    })
  }
  const mora = aplicarAMoras(listaMoras, monto)
  const pago = aplicarPago(calendario, monto - mora.aplicadoCentavos)
  const saldo = credito.saldoCentavos - (monto - mora.aplicadoCentavos)
  const liquida = saldo === 0
  // Anticipada si se liquida antes del vencimiento de la última semana
  const ultimoVencimiento = calendario.at(-1)?.fechaVencimiento ?? ''
  const tipoLiquidacion = hoyEnMexico() < ultimoVencimiento ? 'anticipada' as const : 'normal' as const

  const opId = crypto.randomUUID()
  // El crédito sigue como se leyó: mismo estado, saldo y última modificación (un pago solo de mora no cambia el saldo)
  const sigueIgual = and(
    eq(creditos.estado, 'aceptado'),
    eq(creditos.saldoCentavos, credito.saldoCentavos),
    eq(creditos.actualizadoEn, credito.actualizadoEn),
  )!
  const condicion = condicionExtra ? and(sigueIgual, condicionExtra)! : sigueIgual

  const consultas = [
    ...insertarMoras(db, credito.id, nuevas, ahora),
    ...tomarFolio(event, 'OP', sigueIgualSql(credito.id, condicion)),
    insertarOperacion(event, {
      id: opId,
      creditoId: credito.id,
      tipo: liquida ? 'liquidacion' : pago.tipo,
      semana: pago.semana,
      montoCentavos: monto,
      moraCentavos: mora.aplicadoCentavos,
      saldoResultanteCentavos: saldo,
      claveIdempotencia,
      registradoPor: actor.id,
      registradoEn: ahora,
    }, condicion),
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
    ...mora.cambios.map((c) =>
      db
        .update(moras)
        .set({ pagadoCentavos: c.pagadoCentavos })
        .where(and(eq(moras.creditoId, credito.id), eq(moras.semana, c.semana), seGuardo(opId)))),
    eventoBitacoraSi(
      event,
      {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: liquida ? 'credito_liquidado' : 'pago_registrado',
        entidad: 'credito',
        entidadId: credito.id,
        detalle: {
          operacionId: opId,
          montoCentavos: monto,
          moraCentavos: mora.aplicadoCentavos,
          saldoCentavos: saldo,
          ...(liquida ? { tipoLiquidacion } : {}),
        },
      },
      operaciones,
      eq(operaciones.id, opId),
    ),
  ]
  return { consultas, indiceInsercion: nuevas.length + 2, opId, montoCentavos: monto, liquida }
}

/**
 * Prepara el desembolso (RF94): el crédito pasa de "Aprobado" a "Vigente" (aceptado) y se registra
 * la operación con su comprobante. Si se entrega en otra fecha que la planeada, el calendario se
 * recorre a partir de la fecha real.
 */
export function prepararDesembolso(
  event: H3Event,
  actor: Usuario,
  credito: Credito,
  fecha: string,
  claveIdempotencia: string,
  condicionExtra?: SQL,
) {
  const db = usarBd(event)
  const ahora = Math.max(Date.now(), credito.actualizadoEn + 1)
  const opId = crypto.randomUUID()
  const condicion = condicionExtra ? and(eq(creditos.estado, 'aprobado'), condicionExtra)! : eq(creditos.estado, 'aprobado')

  const consultas = [
    ...tomarFolio(event, 'OP', sigueIgualSql(credito.id, condicion)),
    insertarOperacion(event, {
      id: opId,
      creditoId: credito.id,
      tipo: 'desembolso',
      semana: null,
      montoCentavos: credito.montoCentavos,
      saldoResultanteCentavos: credito.saldoCentavos,
      claveIdempotencia,
      registradoPor: actor.id,
      registradoEn: ahora,
    }, condicion),
    db
      .update(creditos)
      .set({ estado: 'aceptado', aceptadoEn: ahora, fechaDesembolso: fecha, actualizadoEn: ahora })
      .where(and(eq(creditos.id, credito.id), seGuardo(opId))),
    ...(fecha === credito.fechaDesembolso
      ? []
      : Array.from({ length: credito.plazoSemanas }, (_, i) =>
          db
            .update(calendarioPagos)
            .set({ fechaVencimiento: sumarDias(fecha, 7 * (i + 1)) })
            .where(and(eq(calendarioPagos.creditoId, credito.id), eq(calendarioPagos.semana, i + 1), seGuardo(opId))))),
    eventoBitacoraSi(
      event,
      {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: 'credito_desembolsado',
        entidad: 'credito',
        entidadId: credito.id,
        detalle: { operacionId: opId, montoCentavos: credito.montoCentavos, fecha },
      },
      operaciones,
      eq(operaciones.id, opId),
    ),
  ]
  return { consultas, indiceInsercion: 2, opId }
}
