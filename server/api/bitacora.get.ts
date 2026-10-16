import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { bitacora, usuarios } from '../db/esquema'

const POR_PAGINA = 50
const DIA_MS = 24 * 60 * 60 * 1000
const objetivo = alias(usuarios, 'objetivo') // usuario afectado por la acción

// Inicio de un día (AAAA-MM-DD) en hora del centro de México, en milisegundos.
// México no tiene horario de verano desde 2022: siempre es UTC-6.
const inicioDelDia = (fecha: string) => Date.parse(`${fecha}T00:00:00-06:00`)

// RNF25. Administrador: todo. Gerente: lo suyo y lo de sus Cobradores (RF-122 propuesto).
// Filtros opcionales: acción, usuario y rango de fechas (ambas fechas incluidas).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const { pagina, accion, usuarioId, desde, hasta } = leerConsulta(event, esquemaFiltrosBitacora)

  const filtro = and(
    actor.rol === 'gerente'
      ? or(eq(bitacora.usuarioId, actor.id), eq(bitacora.gerenteId, actor.id))
      : undefined,
    accion ? eq(bitacora.accion, accion) : undefined,
    usuarioId ? eq(bitacora.usuarioId, usuarioId) : undefined,
    desde ? gte(bitacora.creadoEn, inicioDelDia(desde)) : undefined,
    hasta ? lt(bitacora.creadoEn, inicioDelDia(hasta) + DIA_MS) : undefined,
  )

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
