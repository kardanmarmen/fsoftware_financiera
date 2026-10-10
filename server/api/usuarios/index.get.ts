import { asc, eq } from 'drizzle-orm'
import { usuarios } from '../../db/esquema'

// RF28, RF32: el Administrador ve a todos; el Gerente, solo a sus Cobradores.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })

  return await consultaUsuarios(event)
    .where(actor.rol === 'gerente' ? eq(usuarios.gerenteId, actor.id) : undefined)
    .orderBy(asc(usuarios.nombre))
})
