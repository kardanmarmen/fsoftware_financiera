import { asc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientes, creditos, usuarios } from '../../db/esquema'

const cobrador = alias(usuarios, 'cobrador')

// RF11, RF15. Cobrador: sus clientes. Gerente: los de sus Cobradores. Administrador: todos (consulta).
// La búsqueda y la paginación para Gerente y Administrador se agregan en la tarea 2.6.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)

  const ambito
    = actor.rol === 'cobrador' ? eq(clientes.cobradorId, actor.id)
      : actor.rol === 'gerente' ? eq(cobrador.gerenteId, actor.id)
        : undefined

  return await usarBd(event)
    .select({
      id: clientes.id,
      curp: clientes.curp,
      nombre: clientes.nombre,
      apellidoPaterno: clientes.apellidoPaterno,
      apellidoMaterno: clientes.apellidoMaterno,
      telefono: clientes.telefono,
      colonia: clientes.colonia,
      municipio: clientes.municipio,
      cobradorId: clientes.cobradorId,
      cobradorNombre: cobrador.nombre,
      // RF15: créditos activos del cliente (usa idx_creditos_cliente)
      creditosActivos: sql<number>`(SELECT COUNT(*) FROM ${creditos} WHERE ${creditos.clienteId} = ${clientes.id} AND ${creditos.estado} = 'aceptado')`,
    })
    .from(clientes)
    .innerJoin(cobrador, eq(clientes.cobradorId, cobrador.id))
    .where(ambito)
    .orderBy(asc(clientes.nombreBusqueda))
})
