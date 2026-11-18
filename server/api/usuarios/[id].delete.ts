import { and, count, eq, isNull } from 'drizzle-orm'
import { clientes, usuarios } from '../../db/esquema'

// RN-08: eliminación lógica. Solo el Administrador elimina Cobradores, Gerentes y otros Administradores.
// La fila no se borra: la bitácora, los clientes y las operaciones siguen apuntando a ella y mostrando
// su nombre. El usuario queda inactivo, sin sesión, fuera de las listas, y su nombre de usuario se libera.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (!puedeEliminar(actor, objetivo)) {
    throw createError({ statusCode: 403, message: 'No puedes eliminarte a ti mismo' })
  }

  const db = usarBd(event)

  // RN-02: un Cobrador (activo o no) nunca se queda sin Gerente.
  if (objetivo.rol === 'gerente') {
    const cobradores = await db
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(and(eq(usuarios.gerenteId, objetivo.id), noEliminado))
    if (cobradores.length > 0) {
      throw createError({
        statusCode: 409,
        message: `Primero reasigna o elimina a sus Cobradores: ${cobradores.map((c) => c.nombre).join(', ')}`,
      })
    }
  }

  // Los clientes de un Cobrador eliminado no tendrían quién los atienda (RF15).
  if (objetivo.rol === 'cobrador') {
    const [fila] = await db.select({ total: count() }).from(clientes).where(eq(clientes.cobradorId, objetivo.id))
    if ((fila?.total ?? 0) > 0) {
      throw createError({
        statusCode: 409,
        message: `Tiene ${fila!.total} cliente(s) asignado(s). Desactívalo en lugar de eliminarlo para conservar su cartera`,
      })
    }
  }

  const ahora = Date.now()
  await db.batch([
    db
      .update(usuarios)
      .set({
        // El "#" no es válido en un nombre de usuario (RN-01): el nuevo valor nunca choca con uno real,
        // y el nombre original queda libre para registrarlo de nuevo.
        usuario: `${objetivo.usuario}#${objetivo.id}`,
        activo: false,
        eliminadoEn: ahora,
        eliminadoPor: actor.id,
        actualizadoEn: ahora,
      })
      .where(and(eq(usuarios.id, objetivo.id), isNull(usuarios.eliminadoEn))),
    cerrarSesionesDe(event, objetivo.id, 'desactivado'), // RN-06
    eventoBitacora(event, {
      usuarioId: actor.id,
      gerenteId: actor.gerenteId,
      accion: 'usuario_eliminado',
      entidad: 'usuario',
      entidadId: objetivo.id,
      // Copia de sus datos al momento de eliminarlo, para que la bitácora se explique sola.
      detalle: {
        usuario: objetivo.usuario,
        nombre: objetivo.nombre,
        rol: objetivo.rol,
        gerenteId: objetivo.gerenteId,
        estabaActivo: objetivo.activo,
      },
    }),
  ])

  return { ok: true }
})
