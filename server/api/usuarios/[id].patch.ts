import { eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// RF25: editar nombre y nombre de usuario. El rol no cambia (RN-09).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (!puedeAdministrar(actor, objetivo)) {
    throw createError({ statusCode: 403, message: 'No puedes modificar a este usuario' })
  }
  const datos = await leerCuerpo(event, esquemaEditarUsuario)

  const db = usarBd(event)
  try {
    await db.batch([
      db
        .update(usuarios)
        .set({ usuario: datos.usuario, nombre: datos.nombre, actualizadoEn: Date.now() })
        .where(eq(usuarios.id, objetivo.id)),
      eventoBitacora(event, {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: 'usuario_modificado',
        entidad: 'usuario',
        entidadId: objetivo.id,
        detalle: {
          antes: { usuario: objetivo.usuario, nombre: objetivo.nombre },
          despues: datos,
        },
      }),
    ])
  } catch (error) {
    if (esErrorDeDuplicado(error)) {
      throw createError({ statusCode: 409, message: `El usuario "${datos.usuario}" ya existe` })
    }
    throw error
  }

  return { ok: true }
})
