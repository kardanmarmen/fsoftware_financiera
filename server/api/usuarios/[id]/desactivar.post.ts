import { and, eq } from 'drizzle-orm'
import { usuarios } from '../../../db/esquema'

// RF26, RF31. Al quedar inactivo pierde el acceso al momento (RF04, RN-06).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (!puedeAdministrar(actor, objetivo)) {
    throw createError({ statusCode: 403, message: 'No puedes desactivar a este usuario' })
  }
  if (!objetivo.activo) return { ok: true }

  const db = usarBd(event)

  // RN-05: un Gerente con Cobradores activos no se puede desactivar.
  if (objetivo.rol === 'gerente') {
    const cobradores = await db
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(and(eq(usuarios.gerenteId, objetivo.id), eq(usuarios.activo, true)))
    if (cobradores.length > 0) {
      throw createError({
        statusCode: 409,
        message: `Primero reasigna a sus Cobradores activos: ${cobradores.map((c) => c.nombre).join(', ')}`,
      })
    }
  }

  await db.batch([
    db.update(usuarios).set({ activo: false, actualizadoEn: Date.now() }).where(eq(usuarios.id, objetivo.id)),
    cerrarSesionesDe(event, objetivo.id, 'desactivado'), // RN-06
    eventoBitacora(event, {
      usuarioId: actor.id,
      gerenteId: actor.gerenteId,
      accion: 'usuario_desactivado',
      entidad: 'usuario',
      entidadId: objetivo.id,
    }),
  ])
  return { ok: true }
})
