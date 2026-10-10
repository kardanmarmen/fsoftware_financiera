import { eq } from 'drizzle-orm'
import { usuarios } from '../../../db/esquema'

// RF08, RN-11, RN-12, RN-14: solo el Administrador; genera una contraseña temporal de 24 horas
// y cierra la sesión abierta del usuario.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (objetivo.rol === 'administrador') {
    throw createError({ statusCode: 403, message: 'Solo se puede restablecer la contraseña de Gerentes y Cobradores' })
  }

  const contrasenaTemporal = generarContrasenaTemporal()
  const ahora = Date.now()
  const db = usarBd(event)

  await db.batch([
    db
      .update(usuarios)
      .set({
        contrasenaHash: await hashPassword(contrasenaTemporal),
        contrasenaTemporal: true,
        temporalExpiraEn: ahora + VIGENCIA_TEMPORAL_MS,
        actualizadoEn: ahora,
      })
      .where(eq(usuarios.id, objetivo.id)),
    cerrarSesionesDe(event, objetivo.id, 'restablecimiento'),
    eventoBitacora(event, {
      usuarioId: actor.id,
      accion: 'contrasena_restablecida',
      entidad: 'usuario',
      entidadId: objetivo.id,
    }),
  ])

  // Se muestra una sola vez al Administrador; en la base solo queda el hash.
  return { usuario: objetivo.usuario, contrasenaTemporal }
})
