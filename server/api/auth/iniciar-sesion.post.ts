import { and, eq, isNull } from 'drizzle-orm'
import { sesiones, usuarios } from '../../db/esquema'

// RF01, RF02, RF04, RF05
export default defineEventHandler(async (event) => {
  const datos = await leerCuerpo(event, esquemaIniciarSesion)
  const db = usarBd(event)
  const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.usuario, datos.usuario) })

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

  const anterior = await db.query.sesiones.findFirst({
    where: and(eq(sesiones.usuarioId, usuario.id), isNull(sesiones.cerradaEn)),
  })
  const sesion = nuevaSesion(event, usuario.id)

  // RF05: se cierra la sesión anterior y se abre la nueva en la misma operación (RF110).
  await db.batch([
    cerrarSesionesDe(event, usuario.id, 'nuevo_inicio'),
    db.insert(sesiones).values(sesion),
    eventoBitacora(event, {
      usuarioId: usuario.id,
      gerenteId: usuario.gerenteId,
      accion: 'inicio_sesion',
      detalle: { dispositivo: sesion.dispositivo, cerroSesionAnterior: Boolean(anterior) },
    }),
  ])

  await replaceUserSession(event, { user: datosDeSesion(usuario), secure: { sesionId: sesion.id } })
  deleteCookie(event, COOKIE_AVISO, { path: '/' }) // el aviso de una sesión anterior ya no aplica
  return { contrasenaTemporal: usuario.contrasenaTemporal }
})
