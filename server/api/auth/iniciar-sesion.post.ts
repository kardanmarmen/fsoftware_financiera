import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// RF01, RF02, RF04. La tarea 1.4 agrega la sesión única y los cierres automáticos.
export default defineEventHandler(async (event) => {
  const datos = await leerCuerpo(event, esquemaIniciarSesion)
  const usuario = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.usuario, datos.usuario) })

  const valido = usuario?.activo && (await verifyPassword(usuario.contrasenaHash, datos.contrasena))
  if (!usuario || !valido) {
    await eventoBitacora(event, {
      usuarioId: usuario?.id,
      gerenteId: usuario?.gerenteId,
      usuarioIntentado: datos.usuario,
      accion: 'inicio_sesion_fallido',
    })
    // Mismo mensaje si el usuario no existe o la contraseña es incorrecta: no revela qué usuarios existen.
    throw createError({ statusCode: 401, message: 'Usuario o contraseña incorrectos' })
  }

  // RN-12
  if (usuario.contrasenaTemporal && (usuario.temporalExpiraEn ?? 0) < Date.now()) {
    throw createError({
      statusCode: 401,
      message: 'Tu contraseña temporal caducó. Pide una nueva al Administrador',
    })
  }

  await setUserSession(event, { user: datosDeSesion(usuario) })
  await eventoBitacora(event, { usuarioId: usuario.id, gerenteId: usuario.gerenteId, accion: 'inicio_sesion' })

  return { contrasenaTemporal: usuario.contrasenaTemporal }
})
