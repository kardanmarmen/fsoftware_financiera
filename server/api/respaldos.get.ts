import { desc } from 'drizzle-orm'
import { respaldos } from '../db/esquema'

// RF117, RF120: estado de los últimos respaldos (los escribe el Worker respaldos/). Solo el Administrador.
export default defineEventHandler(async (event) => {
  await requerirUsuario(event, { roles: ['administrador'] })
  return await usarBd(event).select().from(respaldos).orderBy(desc(respaldos.iniciadoEn)).limit(12)
})
