import { eq } from 'drizzle-orm'
import { modelosCredito } from '../../../db/esquema'

// RF39: un modelo desactivado ya no se ofrece en solicitudes nuevas; los créditos existentes no cambian.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const id = getRouterParam(event, 'id') ?? ''
  const { activo } = await leerCuerpo(event, esquemaActivarModelo)
  const db = usarBd(event)

  const [resultado] = await db.batch([
    db.update(modelosCredito).set({ activo, actualizadoEn: Date.now() }).where(eq(modelosCredito.id, id)),
    eventoBitacoraSi(
      event,
      { usuarioId: actor.id, accion: 'modelo_modificado', entidad: 'modelo_credito', entidadId: id, detalle: { activo } },
      modelosCredito,
      eq(modelosCredito.id, id),
    ),
  ])
  if (resultado.meta.changes === 0) throw createError({ statusCode: 404, message: 'Modelo no encontrado' })
  return { activo }
})
