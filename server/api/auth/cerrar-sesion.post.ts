import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

export default defineEventHandler(async (event) => {
  const { user } = await getUserSession(event)
  if (user) {
    const usuario = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.id, user.id) })
    await eventoBitacora(event, { usuarioId: user.id, gerenteId: usuario?.gerenteId, accion: 'cierre_sesion' })
  }
  await clearUserSession(event)
  return { ok: true }
})
