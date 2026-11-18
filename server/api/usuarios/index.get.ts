import { and, asc, eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// RF28, RF32: el Administrador ve a todos; el Gerente, solo a sus Cobradores.
// Los eliminados (RN-08) no aparecen, salvo con `?incluirEliminados=1`: lo usa el filtro de la
// bitácora, para seguir consultando lo que hicieron.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const incluirEliminados = getQuery(event).incluirEliminados === '1'

  return await consultaUsuarios(event)
    .where(and(
      incluirEliminados ? undefined : noEliminado,
      actor.rol === 'gerente' ? eq(usuarios.gerenteId, actor.id) : undefined,
    ))
    .orderBy(asc(usuarios.nombre))
})
