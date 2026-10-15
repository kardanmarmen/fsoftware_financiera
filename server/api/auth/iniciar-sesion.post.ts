import { and, eq, isNull } from 'drizzle-orm'
import { sesiones, usuarios } from '../../db/esquema'

// RF01, RF02, RF04, RF05
export default defineEventHandler(async (event) => {
  const datos = await leerCuerpo(event, esquemaIniciarSesion)

  // Máximo 5 intentos por minuto por IP y usuario: frena a quien intente adivinar contraseñas.
  // Se revisa antes de tocar la base y de verificar la contraseña, así un ataque casi no gasta CPU.
  const { success } = await event.context.cloudflare.env.LIMITE_INICIO_SESION.limit({
    key: `${ipDeLaPeticion(event)}:${datos.usuario}`,
  })
  if (!success) {
    throw createError({ statusCode: 429, message: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo' })
  }

  const db = usarBd(event)
  const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.usuario, datos.usuario) })

  const verificacion = usuario?.activo
    ? await verificarContrasena(event, usuario.contrasenaHash, datos.contrasena)
    : { valido: false, debeActualizar: false }
  if (!usuario || !verificacion.valido) {
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

  // Si el hash es de un formato anterior (sin pepper o con otro costo de scrypt), se vuelve a
  // guardar con el actual. Pasa una sola vez por usuario.
  if (verificacion.debeActualizar) {
    await db.update(usuarios)
      .set({ contrasenaHash: await hashearContrasena(event, datos.contrasena) })
      .where(eq(usuarios.id, usuario.id))
  }

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

  // setUserSession (y no replaceUserSession) escribe la cookie una sola vez: replace la borra y la
  // vuelve a crear. Da lo mismo porque siempre se guardan todos los campos (user y sesionId).
  await setUserSession(event, { user: datosDeSesion(usuario), secure: { sesionId: sesion.id } })
  // El aviso de una sesión anterior ya no aplica. Solo se borra si existe: cada cookie escrita cuesta CPU.
  if (getCookie(event, COOKIE_AVISO)) deleteCookie(event, COOKIE_AVISO, { path: '/' })
  return { contrasenaTemporal: usuario.contrasenaTemporal }
})
