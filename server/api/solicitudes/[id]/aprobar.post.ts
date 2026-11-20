import { and, eq, sql } from 'drizzle-orm'
import { calendarioPagos, creditos, solicitudes } from '../../../db/esquema'

// RF47–RF52, RF56: el Gerente aprueba (puede ajustar monto, tasa y plazo) y se genera el crédito en
// estado "Aprobado" con su calendario de pagos. El dinero se entrega después, con el desembolso (RF94).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente'] })
  const solicitud = await obtenerSolicitudParaRevisar(event, actor)
  const datos = await leerCuerpo(event, esquemaAprobarSolicitud)
  const db = usarBd(event)

  const calculo = calcularCredito(datos.montoAprobado, datos.tasaInteres, datos.plazoSemanas, datos.fechaDesembolso)
  const ahora = Date.now()
  const creditoId = crypto.randomUUID()
  // Todo se aplica solo si la solicitud sigue pendiente: si otro Gerente la revisó, nada cambia.
  const pendiente = and(eq(solicitudes.id, solicitud.id), eq(solicitudes.estado, 'pendiente'))!
  const seCreo = sql`EXISTS (SELECT 1 FROM ${creditos} WHERE ${creditos.id} = ${creditoId})`

  const consultas = [
    ...tomarFolio(event, 'CR', sql`EXISTS (SELECT 1 FROM ${solicitudes} WHERE ${pendiente})`),
    insertarSi(db, creditos, {
      id: creditoId,
      folio: folioActual('CR'),
      solicitudId: solicitud.id,
      clienteId: solicitud.clienteId,
      cobradorId: solicitud.cobradorId,
      modeloId: solicitud.modeloId,
      montoCentavos: datos.montoAprobado,
      tasaInteresBp: datos.tasaInteres,
      plazoSemanas: datos.plazoSemanas,
      moraSemanalCentavos: solicitud.moraSemanalCentavos,
      interesCentavos: calculo.interesCentavos,
      totalCentavos: calculo.totalCentavos,
      pagoSemanalCentavos: calculo.pagoSemanalCentavos,
      saldoCentavos: calculo.totalCentavos,
      estado: 'aprobado',
      fechaDesembolso: datos.fechaDesembolso,
      aceptadoEn: null,
      liquidadoEn: null,
      tipoLiquidacion: null,
      creadoEn: ahora,
      actualizadoEn: ahora,
    }, solicitudes, pendiente),
    db
      .update(solicitudes)
      .set({
        estado: 'aprobada',
        montoAprobadoCentavos: datos.montoAprobado,
        tasaInteresBp: datos.tasaInteres,
        plazoSemanas: datos.plazoSemanas,
        fechaDesembolso: datos.fechaDesembolso,
        revisadaPor: actor.id,
        revisadaEn: ahora,
        actualizadoEn: ahora,
      })
      .where(and(eq(solicitudes.id, solicitud.id), seCreo)),
    ...calculo.calendario.map((s) =>
      insertarSi(db, calendarioPagos, { id: crypto.randomUUID(), creditoId, ...s, cubiertoCentavos: 0 }, creditos, eq(creditos.id, creditoId))),
    eventoBitacoraSi(
      event,
      {
        usuarioId: actor.id,
        accion: 'solicitud_aprobada',
        entidad: 'credito',
        entidadId: creditoId,
        detalle: { solicitudId: solicitud.id, ...datos, totalCentavos: calculo.totalCentavos },
      },
      creditos,
      eq(creditos.id, creditoId),
    ),
  ] as const

  const resultados = await db.batch(consultas)
  if (resultados[2].meta.changes === 0) throw createError({ statusCode: 409, message: 'Esta solicitud ya fue revisada' })

  setResponseStatus(event, 201)
  return { creditoId }
})
