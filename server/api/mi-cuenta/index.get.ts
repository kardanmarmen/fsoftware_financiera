import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// Datos de la cuenta propia, solo para consulta (cualquier rol).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const [cuenta] = await consultaUsuarios(event).where(eq(usuarios.id, actor.id))
  if (!cuenta) throw createError({ statusCode: 404, message: 'Usuario no encontrado' })
  return {
    ...cuenta,
    // Solo el Administrador puede editar su nombre: los demás los edita su superior (RF25, RF30).
    puedeEditarNombre: actor.rol === 'administrador',
  }
})
