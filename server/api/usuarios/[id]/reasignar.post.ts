import { eq } from 'drizzle-orm'
import { usuarios } from '../../../db/esquema'

// RN-04: solo el Administrador cambia el Gerente de un Cobrador. El Cobrador conserva sus clientes.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const objetivo = await obtenerUsuarioObjetivo(event, actor)
  if (objetivo.rol !== 'cobrador') {
    throw createError({ statusCode: 400, message: 'Solo se pueden reasignar Cobradores' })
  }

  const { gerenteId } = await leerCuerpo(event, esquemaReasignar)
  if (gerenteId === objetivo.gerenteId) {
    throw createError({ statusCode: 400, message: 'El Cobrador ya pertenece a ese Gerente' })
  }
  const nuevo = await validarGerenteActivo(event, gerenteId)

  const db = usarBd(event)
  await db.batch([
    db.update(usuarios).set({ gerenteId: nuevo.id, actualizadoEn: Date.now() }).where(eq(usuarios.id, objetivo.id)),
    eventoBitacora(event, {
      usuarioId: actor.id,
      accion: 'cobrador_reasignado',
      entidad: 'usuario',
      entidadId: objetivo.id,
      detalle: { gerenteAnteriorId: objetivo.gerenteId, gerenteNuevoId: nuevo.id },
    }),
  ])
  return { ok: true }
})
