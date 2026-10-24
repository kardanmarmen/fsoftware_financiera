import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { clientes, type Usuario, usuarios } from '../db/esquema'

/**
 * Busca al cliente del parámetro `:id` y verifica que el actor pueda verlo (matriz 4.1 del diseño 2.1):
 * Cobrador, sus clientes; Gerente, los de sus Cobradores; Administrador, todos.
 * Responde 404 también cuando no tiene permiso, para no revelar que el cliente existe.
 */
export async function obtenerClienteObjetivo(event: H3Event, actor: Usuario) {
  const id = getRouterParam(event, 'id') ?? ''
  const fila = await usarBd(event)
    .select({ cliente: clientes, cobradorNombre: usuarios.nombre, gerenteId: usuarios.gerenteId })
    .from(clientes)
    .innerJoin(usuarios, eq(clientes.cobradorId, usuarios.id))
    .where(eq(clientes.id, id))
    .get()

  const puedeVer = fila && (
    actor.rol === 'administrador'
    || (actor.rol === 'cobrador' && fila.cliente.cobradorId === actor.id)
    || (actor.rol === 'gerente' && fila.gerenteId === actor.id)
  )
  if (!puedeVer) throw createError({ statusCode: 404, message: 'Cliente no encontrado' })
  return fila
}

/** ¿El actor puede editar los datos del cliente? El Administrador solo consulta. */
export function puedeEditarCliente(actor: Usuario) {
  return actor.rol === 'gerente' || actor.rol === 'cobrador'
}
