import { desc, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { bitacora, usuarios } from '../db/esquema'

const POR_PAGINA = 50
const objetivo = alias(usuarios, 'objetivo') // usuario afectado por la acción

// RNF25. Administrador: todo. Gerente: lo suyo y lo de sus Cobradores (RF-122 propuesto).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const pagina = Math.max(1, Number(getQuery(event).pagina) || 1)

  const filtro = actor.rol === 'gerente'
    ? or(eq(bitacora.usuarioId, actor.id), eq(bitacora.gerenteId, actor.id))
    : undefined

  const db = usarBd(event)
  const [registros, [conteo]] = await Promise.all([
    db
      .select({
        id: bitacora.id,
        accion: bitacora.accion,
        usuarioNombre: usuarios.nombre,
        usuarioIntentado: bitacora.usuarioIntentado,
        objetivoNombre: objetivo.nombre,
        detalle: bitacora.detalle,
        ip: bitacora.ip,
        creadoEn: bitacora.creadoEn,
      })
      .from(bitacora)
      .leftJoin(usuarios, eq(bitacora.usuarioId, usuarios.id))
      .leftJoin(objetivo, eq(bitacora.entidadId, objetivo.id))
      .where(filtro)
      .orderBy(desc(bitacora.creadoEn))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db.select({ total: sql<number>`count(*)` }).from(bitacora).where(filtro),
  ])

  return { registros, total: conteo?.total ?? 0, porPagina: POR_PAGINA }
})
