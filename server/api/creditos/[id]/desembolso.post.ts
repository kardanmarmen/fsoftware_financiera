import { and, eq } from 'drizzle-orm'
import { calendarioPagos, creditos, operaciones } from '../../../db/esquema'

// RF94: el Cobrador (o su Gerente) entrega el dinero al cliente. El crédito pasa de "Aprobado" a
// "Vigente" (aceptado) y se registra la operación de desembolso con su comprobante.
// Si se entrega en otra fecha que la planeada, el calendario se recorre a partir de la fecha real.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { fecha, claveIdempotencia } = await leerCuerpo(event, esquemaDesembolso)

  const repetida = await operacionPorClave(event, credito.id, claveIdempotencia)
  if (repetida) return { operacionId: repetida } // reintento: ya se guardó (RN-24)

  exigirEstado(actor, credito.estado, 'aprobado', 'Este crédito ya fue desembolsado o cancelado')
  if (fecha > hoyEnMexico()) throw createError({ statusCode: 400, message: 'La fecha de desembolso no puede ser futura' })

  const db = usarBd(event)
  const ahora = Date.now()
  const opId = crypto.randomUUID()
  const sigue = eq(creditos.estado, 'aprobado')

  const [, , insercion] = await db.batch([
    ...tomarFolio(event, 'OP', sigueIgualSql(credito.id, sigue)),
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
    }, sigue),
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
  ])
  if (insercion.meta.changes === 0) {
    throw createError({ statusCode: 409, message: 'Este crédito ya fue desembolsado o cancelado. Recarga la página.' })
  }

  setResponseStatus(event, 201)
  return { operacionId: opId }
})
