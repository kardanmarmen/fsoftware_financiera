import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// El Administrador no tiene superior que edite su cuenta, así que corrige su propio nombre.
// Gerentes y Cobradores no pueden: sus datos los actualiza su superior (RF25, RF30).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const { nombre } = await leerCuerpo(event, esquemaMiCuenta)

  const db = usarBd(event)
  await db.batch([
    db.update(usuarios).set({ nombre, actualizadoEn: Date.now() }).where(eq(usuarios.id, actor.id)),
    eventoBitacora(event, {
      usuarioId: actor.id,
      accion: 'usuario_modificado',
      entidad: 'usuario',
      entidadId: actor.id,
      detalle: { antes: { nombre: actor.nombre }, despues: { nombre } },
    }),
  ])

  // El nombre también va en la cookie de sesión (se muestra en el encabezado).
  await setUserSession(event, { user: { ...datosDeSesion(actor), nombre } })
  return { ok: true }
})
