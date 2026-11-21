import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { calendarioPagos, creditos, moras, operaciones } from '../../../db/esquema'

const esquema = esquemaCorreccion.extend({ operacionId: z.uuid() })

// RF72: el Gerente corrige un pago, abono o liquidación mal registrado. La operación original no se
// modifica ni se borra (RF115): se registra una corrección que la revierte, con motivo y comprobante.
// El saldo, las semanas y las moras regresan a como estaban; si era una liquidación, el crédito vuelve a Vigente.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { operacionId, motivo, claveIdempotencia } = await leerCuerpo(event, esquema)

  const repetida = await operacionPorClave(event, credito.id, claveIdempotencia)
  if (repetida) return { operacionId: repetida } // reintento: ya se guardó (RN-24)

  const db = usarBd(event)
  if ((await operacionCorregible(db, credito.id)) !== operacionId) {
    throw createError({
      statusCode: 409,
      message: 'Solo se corrige el último pago, abono o liquidación del crédito que no esté corregido. Recarga la página.',
    })
  }
  // Revertir una liquidación deja el crédito vigente otra vez: no si el cliente ya abrió otro
  if (credito.estado === 'liquidado') {
    const revision = await revisarNuevaSolicitud(db, credito.clienteId)
    if (!revision.permitido || revision.creditoAnterior) {
      throw createError({
        statusCode: 409,
        message: 'El cliente ya tiene otra solicitud o crédito abierto; no se puede reabrir este crédito',
      })
    }
  }
  const original = (await db.query.operaciones.findFirst({ where: eq(operaciones.id, operacionId) }))!

  const { calendario, moras: listaMoras } = await leerCalendarioYMoras(db, credito)
  const alSaldo = original.montoCentavos - original.moraCentavos
  const semanas = revertirReparto(calendario, (s) => s.cubiertoCentavos, alSaldo)
  const morasRevertidas = revertirReparto(listaMoras, (m) => m.pagadoCentavos, original.moraCentavos)
  if (semanas.faltante || morasRevertidas.faltante) {
    throw createError({ statusCode: 409, message: 'El calendario no coincide con la operación; revisa el crédito con el Administrador' })
  }

  const ahora = Math.max(Date.now(), credito.actualizadoEn + 1)
  const opId = crypto.randomUUID()
  const saldo = credito.saldoCentavos + alSaldo
  // El crédito sigue como se leyó y la operación no se corrigió mientras tanto
  const condicion = and(
    eq(creditos.estado, credito.estado),
    eq(creditos.saldoCentavos, credito.saldoCentavos),
    eq(creditos.actualizadoEn, credito.actualizadoEn),
    sql`NOT EXISTS (SELECT 1 FROM ${operaciones} WHERE ${operaciones.operacionCorregidaId} = ${operacionId})`,
  )!

  const resultado = await ejecutarOperacion(event, {
    opId,
    indiceInsercion: 2,
    consultas: [
      ...tomarFolio(event, 'OP', sigueIgualSql(credito.id, condicion)),
      insertarOperacion(event, {
        id: opId,
        creditoId: credito.id,
        tipo: 'correccion',
        semana: original.semana,
        montoCentavos: original.montoCentavos,
        moraCentavos: original.moraCentavos,
        saldoResultanteCentavos: saldo,
        operacionCorregidaId: original.id,
        motivo,
        claveIdempotencia,
        registradoPor: actor.id,
        registradoEn: ahora,
      }, condicion),
      db
        .update(creditos)
        .set({ saldoCentavos: saldo, estado: 'aceptado', liquidadoEn: null, tipoLiquidacion: null, actualizadoEn: ahora })
        .where(and(eq(creditos.id, credito.id), seGuardo(opId))),
      ...semanas.cambios.map((c) =>
        db
          .update(calendarioPagos)
          .set({ cubiertoCentavos: c.valor })
          .where(and(eq(calendarioPagos.creditoId, credito.id), eq(calendarioPagos.semana, c.semana), seGuardo(opId)))),
      ...morasRevertidas.cambios.map((c) =>
        db
          .update(moras)
          .set({ pagadoCentavos: c.valor })
          .where(and(eq(moras.creditoId, credito.id), eq(moras.semana, c.semana), seGuardo(opId)))),
      eventoBitacoraSi(
        event,
        {
          usuarioId: actor.id,
          accion: 'operacion_corregida',
          entidad: 'credito',
          entidadId: credito.id,
          detalle: { operacionId: opId, corrige: original.folio, montoCentavos: original.montoCentavos, motivo },
        },
        operaciones,
        eq(operaciones.id, opId),
      ),
    ],
  })
  setResponseStatus(event, 201)
  return resultado
})
