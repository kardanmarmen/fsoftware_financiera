import { and, eq } from 'drizzle-orm'
import { creditos } from '../../../db/esquema'

// RF96: el cliente no recibió el dinero; el crédito aprobado se cancela con un motivo.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { credito } = await obtenerCreditoObjetivo(event, actor)
  const { motivo } = await leerCuerpo(event, esquemaCancelarCredito)
  exigirEstado(actor, credito.estado, 'aprobado', 'Solo se cancelan créditos que no se han desembolsado')

  const db = usarBd(event)
  const ahora = Date.now()
  const [resultado] = await db.batch([
    db
      .update(creditos)
      .set({ estado: 'cancelado', actualizadoEn: ahora })
      .where(and(eq(creditos.id, credito.id), eq(creditos.estado, 'aprobado'))),
    eventoBitacoraSi(
      event,
      { usuarioId: actor.id, gerenteId: actor.gerenteId, accion: 'credito_cancelado', entidad: 'credito', entidadId: credito.id, detalle: { motivo } },
      creditos,
      and(eq(creditos.id, credito.id), eq(creditos.actualizadoEn, ahora))!,
    ),
  ])
  if (resultado.meta.changes === 0) {
    throw createError({ statusCode: 409, message: 'Este crédito ya fue desembolsado o cancelado. Recarga la página.' })
  }
  return { estado: 'cancelado' }
})
