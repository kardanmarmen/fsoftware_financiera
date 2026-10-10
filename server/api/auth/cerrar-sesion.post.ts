import { eq } from 'drizzle-orm'
import { sesiones, usuarios } from '../../db/esquema'

// Cierra la sesión en la base de datos: cualquier copia de la cookie deja de servir.
export default defineEventHandler(async (event) => {
  const { user, secure } = await getUserSession(event)

  if (user && secure?.sesionId) {
    const db = usarBd(event)
    const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.id, user.id) })
    await db.batch([
      db.update(sesiones).set({ cerradaEn: Date.now(), motivoCierre: 'salida' }).where(eq(sesiones.id, secure.sesionId)),
      eventoBitacora(event, { usuarioId: user.id, gerenteId: usuario?.gerenteId, accion: 'cierre_sesion' }),
    ])
  }

  await clearUserSession(event)
  return { ok: true }
})
