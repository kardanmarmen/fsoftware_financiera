import { eq } from 'drizzle-orm'
import { creditos, solicitudes } from '../../../db/esquema'

// RF94: el Cobrador (o su Gerente) entrega el dinero al cliente; el crédito pasa a "Vigente".
// RF86, RF87: si el crédito es una renovación, en la misma transacción se liquida el crédito anterior
// con parte del monto nuevo, y el cliente recibe la diferencia. Si algo cambió, no se guarda nada.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { fecha, claveIdempotencia } = await leerCuerpo(event, esquemaDesembolso)

  const repetida = await operacionPorClave(event, credito.id, claveIdempotencia)
  if (repetida) return { operacionId: repetida } // reintento: ya se guardó (RN-24)

  exigirEstado(actor, credito.estado, 'aprobado', 'Este crédito ya fue desembolsado o cancelado')
  if (fecha > hoyEnMexico()) throw createError({ statusCode: 400, message: 'La fecha de desembolso no puede ser futura' })

  const db = usarBd(event)
  const solicitud = await db.query.solicitudes.findFirst({ where: eq(solicitudes.id, credito.solicitudId) })
  const anterior = solicitud?.creditoAnteriorId
    ? await db.query.creditos.findFirst({ where: eq(creditos.id, solicitud.creditoAnteriorId) })
    : undefined

  if (!anterior) {
    const resultado = await ejecutarOperacion(event, prepararDesembolso(event, actor, credito, fecha, claveIdempotencia))
    setResponseStatus(event, 201)
    return resultado
  }

  if (anterior.estado !== 'aceptado') {
    throw createError({ statusCode: 409, message: `El crédito anterior ${anterior.folio} ya no está vigente; cancela este crédito y captura una solicitud nueva` })
  }
  // El crédito anterior se liquida solo si el nuevo sigue aprobado, y el nuevo se desembolsa solo si
  // el anterior se liquidó: o se guardan las dos operaciones o ninguna.
  const liquidacion = await prepararPago(event, actor, anterior, 'todo', `${claveIdempotencia}:renovacion`, sigueIgualSql(credito.id, eq(creditos.estado, 'aprobado')))
  if (liquidacion.montoCentavos >= credito.montoCentavos) {
    throw createError({
      statusCode: 409,
      message: `El adeudo del crédito anterior (${formatearDinero(liquidacion.montoCentavos)}) es mayor o igual al monto de la renovación`,
    })
  }
  const desembolso = prepararDesembolso(event, actor, credito, fecha, claveIdempotencia, seGuardo(liquidacion.opId))
  const resultado = await ejecutarOperacion(event, {
    consultas: [...liquidacion.consultas, ...desembolso.consultas],
    indiceInsercion: liquidacion.consultas.length + desembolso.indiceInsercion,
    opId: desembolso.opId,
  })
  setResponseStatus(event, 201)
  return resultado
})
