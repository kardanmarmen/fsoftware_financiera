import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { clientes, type Usuario, usuarios } from '../../db/esquema'

// RF10, RF13, RF15. Registra el Cobrador (el cliente queda a su cargo) o el Gerente (elige a cuál de
// sus Cobradores). El Administrador solo consulta (matriz 4.1 del diseño 2.1).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const datos = await leerCuerpo(event, esquemaNuevoCliente)
  const db = usarBd(event)

  let cobradorId = actor.id
  if (actor.rol === 'gerente') {
    if (!datos.cobradorId) throw createError({ statusCode: 400, message: 'Elige el Cobrador' })
    const cobrador = await db.query.usuarios.findFirst({
      where: and(eq(usuarios.id, datos.cobradorId), eq(usuarios.gerenteId, actor.id), eq(usuarios.activo, true)),
    })
    if (!cobrador) {
      throw createError({ statusCode: 400, message: 'El Cobrador elegido no es tuyo o está desactivado' })
    }
    cobradorId = cobrador.id
  }

  const { cobradorId: _, ...cliente } = datos
  const ahora = Date.now()
  const id = crypto.randomUUID()

  try {
    await db.batch([
      db.insert(clientes).values({
        ...cliente,
        id,
        nombreBusqueda: nombreParaBusqueda(cliente),
        fechaNacimiento: fechaDeCurp(cliente.curp)!, // el esquema ya validó que la fecha existe
        cobradorId,
        creadoPor: actor.id,
        creadoEn: ahora,
        actualizadoEn: ahora,
      }),
      insertarPalabras(event, id, cliente), // índice de búsqueda (RNF06)
      eventoBitacora(event, {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: 'cliente_creado',
        entidad: 'cliente',
        entidadId: id,
        detalle: { curp: cliente.curp, nombre: nombreCompleto(cliente), cobradorId },
      }),
    ])
  } catch (error) {
    if (esErrorDeDuplicado(error)) throw await errorCurpRepetida(event, actor, cliente.curp)
    throw error
  }

  setResponseStatus(event, 201)
  return { id }
})

// RN-23: si el cliente es de alguien más, no se muestran sus datos.
async function errorCurpRepetida(event: H3Event, actor: Usuario, curp: string) {
  const existente = await usarBd(event)
    .select({ id: clientes.id, cobradorId: clientes.cobradorId, gerenteId: usuarios.gerenteId })
    .from(clientes)
    .innerJoin(usuarios, eq(clientes.cobradorId, usuarios.id))
    .where(eq(clientes.curp, curp))
    .get()
  const esSuyo = existente && (existente.cobradorId === actor.id || existente.gerenteId === actor.id)
  return createError({
    statusCode: 409,
    message: esSuyo
      ? 'Este cliente ya está registrado'
      : actor.rol === 'gerente'
        ? 'Este cliente ya está registrado con otro Gerente'
        : 'Este cliente ya está registrado; consulta con tu Gerente',
    data: esSuyo ? { clienteId: existente.id } : undefined,
  })
}
