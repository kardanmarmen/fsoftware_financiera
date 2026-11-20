// RF73–RF78, RNF26: cobranza de los créditos vigentes: qué vence hoy, qué está atrasado y quién es moroso.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  return await situacionCobranza(usarBd(event), actor)
})
