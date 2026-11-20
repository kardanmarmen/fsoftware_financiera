import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { solicitudes, type Usuario, usuarios } from '../db/esquema'

/**
 * Solicitud del parámetro `:id` que el Gerente puede revisar: solo las de sus Cobradores (RF46).
 * Responde 404 también sin permiso, para no revelar que existe.
 */
export async function obtenerSolicitudParaRevisar(event: H3Event, actor: Usuario) {
  const id = getRouterParam(event, 'id') ?? ''
  const fila = await usarBd(event)
    .select({ solicitud: solicitudes, gerenteId: usuarios.gerenteId })
    .from(solicitudes)
    .innerJoin(usuarios, eq(solicitudes.cobradorId, usuarios.id))
    .where(eq(solicitudes.id, id))
    .get()
  if (!fila || fila.gerenteId !== actor.id) throw createError({ statusCode: 404, message: 'Solicitud no encontrada' })
  if (fila.solicitud.estado !== 'pendiente') {
    throw createError({ statusCode: 409, message: 'Esta solicitud ya fue revisada' })
  }
  return fila.solicitud
}
