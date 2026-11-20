import { and, eq } from 'drizzle-orm'
import { solicitudes } from '../../../db/esquema'

// RF50, RF51: el Gerente rechaza la solicitud con un motivo.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente'] })
  const solicitud = await obtenerSolicitudParaRevisar(event, actor)
  const { motivo } = await leerCuerpo(event, esquemaRechazarSolicitud)
  const db = usarBd(event)
  const ahora = Date.now()

  const [resultado] = await db.batch([
    db
      .update(solicitudes)
      .set({ estado: 'rechazada', motivo, revisadaPor: actor.id, revisadaEn: ahora, actualizadoEn: ahora })
      .where(and(eq(solicitudes.id, solicitud.id), eq(solicitudes.estado, 'pendiente'))),
    eventoBitacoraSi(
      event,
      { usuarioId: actor.id, accion: 'solicitud_rechazada', entidad: 'solicitud', entidadId: solicitud.id, detalle: { motivo } },
      solicitudes,
      and(eq(solicitudes.id, solicitud.id), eq(solicitudes.revisadaEn, ahora))!,
    ),
  ])
  if (resultado.meta.changes === 0) throw createError({ statusCode: 409, message: 'Esta solicitud ya fue revisada' })
  return { estado: 'rechazada' }
})
