import { and, eq, exists, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { clientePalabras, clientes, type Usuario, usuarios } from '../db/esquema'

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

type Nombre = { nombre: string, apellidoPaterno: string, apellidoMaterno?: string | null }

/** Palabras del nombre para el índice de búsqueda: "perez", "lopez", "ana" (sin repetir). */
export function palabrasDelNombre(c: Nombre) {
  return [...new Set(nombreParaBusqueda(c).split(' '))].filter(Boolean)
}

/** Consultas para guardar las palabras de un cliente nuevo (van en el mismo db.batch que el alta). */
export function insertarPalabras(event: H3Event, clienteId: string, c: Nombre) {
  return usarBd(event).insert(clientePalabras).values(palabrasDelNombre(c).map((palabra) => ({ clienteId, palabra })))
}

/**
 * Consultas para reemplazar las palabras al editar el nombre. Solo se aplican si el cliente quedó con
 * `actualizadoEn` (es decir, si la edición se guardó); si otra persona guardó antes, no cambian nada.
 */
export function reemplazarPalabras(event: H3Event, clienteId: string, c: Nombre, actualizadoEn: number) {
  const db = usarBd(event)
  const seGuardo = exists(
    db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, clienteId), eq(clientes.actualizadoEn, actualizadoEn))),
  )
  return [
    db.delete(clientePalabras).where(and(eq(clientePalabras.clienteId, clienteId), seGuardo)),
    ...palabrasDelNombre(c).map((palabra) =>
      db.insert(clientePalabras).select(
        db.select({ clienteId: sql<string>`${clienteId}`.as('cliente_id'), palabra: sql<string>`${palabra}`.as('palabra') })
          .from(clientes)
          .where(and(eq(clientes.id, clienteId), eq(clientes.actualizadoEn, actualizadoEn))),
      )),
  ]
}

/** ¿El actor puede editar los datos del cliente? El Administrador solo consulta. */
export function puedeEditarCliente(actor: Usuario) {
  return actor.rol === 'gerente' || actor.rol === 'cobrador'
}
