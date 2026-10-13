import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// RN-13, RN-15. También es el cambio obligatorio después de una contraseña temporal (RF09).
export default defineEventHandler(async (event) => {
  const usuario = await requerirUsuario(event, { permitirTemporal: true })
  const datos = await leerCuerpo(event, esquemaCambiarContrasena)

  if (!(await verificarContrasena(event, usuario.contrasenaHash, datos.actual)).valido) {
    throw createError({ statusCode: 400, message: 'La contraseña actual no es correcta' })
  }
  if (usuario.contrasenaTemporal && (usuario.temporalExpiraEn ?? 0) < Date.now()) {
    throw createError({
      statusCode: 400,
      message: 'Tu contraseña temporal caducó. Pide una nueva al Administrador',
    })
  }

  const db = usarBd(event)
  await db.batch([
    db
      .update(usuarios)
      .set({
        contrasenaHash: await hashearContrasena(event, datos.nueva),
        contrasenaTemporal: false,
        temporalExpiraEn: null,
        actualizadoEn: Date.now(),
      })
      .where(eq(usuarios.id, usuario.id)),
    eventoBitacora(event, { usuarioId: usuario.id, gerenteId: usuario.gerenteId, accion: 'contrasena_cambiada' }),
  ])

  await setUserSession(event, { user: { ...datosDeSesion(usuario), contrasenaTemporal: false } })
  return { ok: true }
})
