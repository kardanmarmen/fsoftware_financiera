// RF97–RF99: liquidación. El cliente paga todo el saldo pendiente y el crédito queda liquidado
// (anticipada si es antes del último vencimiento). Genera el comprobante de liquidación (RF100).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { claveIdempotencia } = await leerCuerpo(event, esquemaLiquidacion)

  const repetida = await operacionPorClave(event, credito.id, claveIdempotencia)
  if (repetida) return { operacionId: repetida } // reintento: ya se guardó (RN-24)

  exigirEstado(actor, credito.estado, 'aceptado', 'Solo se liquidan créditos vigentes')
  setResponseStatus(event, 201)
  return await registrarPago(event, actor, credito, credito.saldoCentavos, claveIdempotencia)
})
