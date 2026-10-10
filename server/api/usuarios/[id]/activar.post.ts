import { eq } from 'drizzle-orm'
import { usuarios } from '../../../db/esquema'

// RF26, RF31
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (!puedeAdministrar(actor, objetivo)) {
    throw createError({ statusCode: 403, message: 'No puedes activar a este usuario' })
  }
  if (objetivo.activo) return { ok: true }

  // RN-02: un Cobrador activo necesita un Gerente activo.
  if (objetivo.rol === 'cobrador') {
    const g = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.id, objetivo.gerenteId!) })
    if (!g?.activo) {
      throw createError({
        statusCode: 409,
        message: 'Su Gerente está desactivado. El Administrador debe reasignarlo a otro Gerente primero',
      })
    }
  }

  const db = usarBd(event)
  await db.batch([
    db.update(usuarios).set({ activo: true, actualizadoEn: Date.now() }).where(eq(usuarios.id, objetivo.id)),
    eventoBitacora(event, {
      usuarioId: actor.id,
      gerenteId: actor.gerenteId,
      accion: 'usuario_activado',
      entidad: 'usuario',
      entidadId: objetivo.id,
    }),
  ])
  return { ok: true }
})
