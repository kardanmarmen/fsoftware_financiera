import { and, eq, sql } from 'drizzle-orm'
import { creditos, moras } from '../../../db/esquema'

// RF79: el Gerente condona (perdona) la mora pendiente de un crédito de sus Cobradores, con motivo.
// No cambia el saldo del crédito: la mora se lleva aparte.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { motivo } = await leerCuerpo(event, esquemaCondonarMora)
  exigirEstado(actor, credito.estado, 'aceptado', 'Solo se condona la mora de créditos vigentes')

  const db = usarBd(event)
  const ahora = Math.max(Date.now(), credito.actualizadoEn + 1)
  const { nuevas, moraPendienteCentavos } = await leerCalendarioYMoras(db, credito)
  if (moraPendienteCentavos === 0) throw createError({ statusCode: 409, message: 'Este crédito no tiene mora pendiente' })

  const [actualizacion] = await db.batch([
    // Marca el crédito como modificado: si alguien registra un pago al mismo tiempo, uno de los dos se rechaza
    db
      .update(creditos)
      .set({ actualizadoEn: ahora })
      .where(and(eq(creditos.id, credito.id), eq(creditos.actualizadoEn, credito.actualizadoEn))),
    ...insertarMoras(db, credito.id, nuevas, ahora),
    db
      .update(moras)
      .set({ condonadoCentavos: sql`${moras.montoCentavos} - ${moras.pagadoCentavos}` })
      .where(and(eq(moras.creditoId, credito.id), sigueIgualSql(credito.id, eq(creditos.actualizadoEn, ahora)))),
    eventoBitacoraSi(
      event,
      {
        usuarioId: actor.id,
        accion: 'mora_condonada',
        entidad: 'credito',
        entidadId: credito.id,
        detalle: { montoCentavos: moraPendienteCentavos, motivo },
      },
      creditos,
      and(eq(creditos.id, credito.id), eq(creditos.actualizadoEn, ahora))!,
    ),
  ])
  if (actualizacion.meta.changes === 0) throw errorCreditoCambio()
  return { condonadoCentavos: moraPendienteCentavos }
})
