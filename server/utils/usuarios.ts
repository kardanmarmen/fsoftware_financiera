import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { usuarios, type Usuario } from '../db/esquema'

const gerente = alias(usuarios, 'gerente')

/** Consulta de usuarios con el nombre de su Gerente. Nunca incluye el hash de la contraseña. */
export function consultaUsuarios(event: H3Event) {
  return usarBd(event)
    .select({
      id: usuarios.id,
      usuario: usuarios.usuario,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      contrasenaTemporal: usuarios.contrasenaTemporal,
      gerenteId: usuarios.gerenteId,
      gerenteNombre: gerente.nombre,
      creadoEn: usuarios.creadoEn,
      actualizadoEn: usuarios.actualizadoEn,
    })
    .from(usuarios)
    .leftJoin(gerente, eq(usuarios.gerenteId, gerente.id))
}

/** Busca al usuario del parámetro `:id` y verifica que el actor pueda verlo; si no, responde 404. */
export async function obtenerUsuarioObjetivo(event: H3Event, actor: Usuario) {
  const id = getRouterParam(event, 'id') ?? ''
  const objetivo = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.id, id) })
  // 404 también cuando no tiene permiso: no revela que el usuario existe.
  if (!objetivo || !puedeVer(actor, objetivo)) {
    throw createError({ statusCode: 404, message: 'Usuario no encontrado' })
  }
  return objetivo
}

/** Verifica que `gerenteId` sea un Gerente activo. */
export async function validarGerenteActivo(event: H3Event, gerenteId: string) {
  const g = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.id, gerenteId) })
  if (!g || g.rol !== 'gerente' || !g.activo) {
    throw createError({ statusCode: 400, message: 'El Gerente elegido no existe o está desactivado' })
  }
  return g
}
