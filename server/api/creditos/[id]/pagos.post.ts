// RF64–RF68: el Cobrador (o su Gerente) registra un pago o abono del crédito vigente.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { monto, claveIdempotencia } = await leerCuerpo(event, esquemaPago)

  const repetida = await operacionPorClave(event, credito.id, claveIdempotencia)
  if (repetida) return { operacionId: repetida } // reintento: ya se guardó (RN-24)

  exigirEstado(actor, credito.estado, 'aceptado', 'Solo se registran pagos en créditos vigentes')
  setResponseStatus(event, 201)
  return await registrarPago(event, actor, credito, monto, claveIdempotencia)
})
