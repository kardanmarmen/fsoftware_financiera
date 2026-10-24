// RF11, RF15: ficha del cliente con su Cobrador responsable.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { cliente, cobradorNombre } = await obtenerClienteObjetivo(event, actor)
  const { nombreBusqueda: _, ...datos } = cliente

  return {
    ...datos,
    cobradorNombre,
    puedeEditar: puedeEditarCliente(actor),
    puedeCorregirCurp: actor.rol === 'gerente', // matriz 4.1
  }
})
