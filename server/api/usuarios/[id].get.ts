import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)

  const [usuario] = await consultaUsuarios(event).where(eq(usuarios.id, objetivo.id))
  if (!usuario) throw createError({ statusCode: 404, message: 'Usuario no encontrado' })
  return {
    ...usuario,
    // La pantalla usa esto para mostrar u ocultar los botones (RNF16).
    puedeAdministrar: puedeAdministrar(actor, objetivo),
    puedeReasignar: actor.rol === 'administrador' && objetivo.rol === 'cobrador',
    puedeRestablecer: actor.rol === 'administrador' && objetivo.rol !== 'administrador',
  }
})
