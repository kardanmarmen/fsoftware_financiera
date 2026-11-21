import { eq, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientes, creditos, operaciones, usuarios } from '../../db/esquema'

// RF100, RF102, RF114: datos del comprobante de una operación (desembolso, pago, abono o liquidación).
// Mismo ámbito que el crédito: Cobrador, los suyos; Gerente, los de sus Cobradores; Administrador, todos.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const id = getRouterParam(event, 'id') ?? ''
  const cobrador = alias(usuarios, 'cobrador')
  const registro = alias(usuarios, 'registro')

  const fila = await usarBd(event)
    .select({
      operacion: operaciones,
      credito: {
        id: creditos.id,
        folio: creditos.folio,
        cobradorId: creditos.cobradorId,
        estado: creditos.estado,
        montoCentavos: creditos.montoCentavos,
        totalCentavos: creditos.totalCentavos,
        tasaInteresBp: creditos.tasaInteresBp,
        plazoSemanas: creditos.plazoSemanas,
        pagoSemanalCentavos: creditos.pagoSemanalCentavos,
        fechaDesembolso: creditos.fechaDesembolso,
        tipoLiquidacion: creditos.tipoLiquidacion,
      },
      cliente: {
        nombre: clientes.nombre,
        apellidoPaterno: clientes.apellidoPaterno,
        apellidoMaterno: clientes.apellidoMaterno,
        curp: clientes.curp,
      },
      cobradorNombre: cobrador.nombre,
      gerenteId: cobrador.gerenteId,
      registradoPorNombre: registro.nombre,
    })
    .from(operaciones)
    .innerJoin(creditos, eq(operaciones.creditoId, creditos.id))
    .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
    .innerJoin(cobrador, eq(creditos.cobradorId, cobrador.id))
    .innerJoin(registro, eq(operaciones.registradoPor, registro.id))
    .where(eq(operaciones.id, id))
    .get()

  const puedeVer = fila && (
    actor.rol === 'administrador'
    || (actor.rol === 'cobrador' && fila.credito.cobradorId === actor.id)
    || (actor.rol === 'gerente' && fila.gerenteId === actor.id)
  )
  if (!puedeVer) throw createError({ statusCode: 404, message: 'Comprobante no encontrado' })

  const { operacion: op, credito, cliente } = fila
  // RF86: en una renovación, el desembolso del crédito nuevo y la liquidación del anterior se guardan
  // juntos y sus claves se relacionan: <clave> y <clave>:renovacion
  const sufijo = ':renovacion'
  const relacionada = await usarBd(event)
    .select({ operacionId: operaciones.id, folio: operaciones.folio, montoCentavos: operaciones.montoCentavos, creditoFolio: creditos.folio })
    .from(operaciones)
    .innerJoin(creditos, eq(operaciones.creditoId, creditos.id))
    .where(or(
      eq(operaciones.claveIdempotencia, `${op.claveIdempotencia}${sufijo}`),
      eq(operaciones.claveIdempotencia, op.claveIdempotencia.endsWith(sufijo) ? op.claveIdempotencia.slice(0, -sufijo.length) : '-'),
    ))
    .get()

  return {
    folio: op.folio,
    tipo: op.tipo,
    semana: op.semana,
    montoCentavos: op.montoCentavos,
    moraCentavos: op.moraCentavos,
    // En el desembolso el saldo no cambia: el cliente debe el total desde que recibe el dinero
    saldoAnteriorCentavos: op.tipo === 'desembolso' ? null : op.saldoResultanteCentavos + op.montoCentavos - op.moraCentavos,
    // Desembolso de una renovación: liquidación del crédito anterior. Liquidación por renovación: desembolso del nuevo.
    renovacion: relacionada ?? null,
    saldoResultanteCentavos: op.saldoResultanteCentavos,
    registradoEn: op.registradoEn,
    motivo: op.motivo,
    // RF72: folio de la operación que corrige, o de la corrección que la anuló
    corrige: op.operacionCorregidaId
      ? (await usarBd(event).select({ folio: operaciones.folio }).from(operaciones).where(eq(operaciones.id, op.operacionCorregidaId)).get())?.folio ?? null
      : null,
    corregidaPor: (await usarBd(event).select({ folio: operaciones.folio }).from(operaciones).where(eq(operaciones.operacionCorregidaId, op.id)).get())?.folio ?? null,
    registradoPorNombre: fila.registradoPorNombre,
    cobradorNombre: fila.cobradorNombre,
    clienteNombre: nombreCompleto(cliente),
    clienteCurp: cliente.curp,
    credito: { ...credito, cobradorId: undefined },
  }
})
