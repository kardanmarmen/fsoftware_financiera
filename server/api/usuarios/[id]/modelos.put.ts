import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { cobradorModelos, modelosCredito } from '../../../db/esquema'

const esquema = z.object({ modeloIds: z.array(z.uuid()).max(100) })

// RF27: el Gerente (o el Administrador) define qué modelos de crédito puede usar un Cobrador.
// Una lista vacía quita las restricciones: el Cobrador puede usar todos los modelos activos.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (objetivo.rol !== 'cobrador' || !puedeAdministrar(actor, objetivo)) {
    throw createError({ statusCode: 403, message: 'Solo se asignan modelos a tus Cobradores' })
  }
  const modeloIds = [...new Set((await leerCuerpo(event, esquema)).modeloIds)]
  const db = usarBd(event)
  if (modeloIds.length) {
    const existentes = await db.select({ id: modelosCredito.id }).from(modelosCredito).where(inArray(modelosCredito.id, modeloIds))
    if (existentes.length !== modeloIds.length) throw createError({ statusCode: 400, message: 'Algún modelo no existe' })
  }

  const ahora = Date.now()
  await db.batch([
    db.delete(cobradorModelos).where(eq(cobradorModelos.cobradorId, objetivo.id)),
    ...modeloIds.map((modeloId) =>
      db.insert(cobradorModelos).values({ cobradorId: objetivo.id, modeloId, asignadoPor: actor.id, asignadoEn: ahora })),
    eventoBitacora(event, {
      usuarioId: actor.id,
      gerenteId: actor.gerenteId,
      accion: 'modelos_asignados',
      entidad: 'usuario',
      entidadId: objetivo.id,
      detalle: { modeloIds },
    }),
  ])
  return { modeloIds }
})
