import { type SQL, sql } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { bitacora } from '../db/esquema'

interface Evento {
  usuarioId?: string | null
  gerenteId?: string | null
  usuarioIntentado?: string
  accion: string
  entidad?: string
  entidadId?: string
  detalle?: Record<string, unknown>
}

function valores(event: H3Event, evento: Evento) {
  return {
    id: crypto.randomUUID(),
    usuarioId: evento.usuarioId ?? null,
    gerenteId: evento.gerenteId ?? null,
    usuarioIntentado: evento.usuarioIntentado ?? null,
    accion: evento.accion,
    entidad: evento.entidad ?? null,
    entidadId: evento.entidadId ?? null,
    detalle: evento.detalle ? JSON.stringify(evento.detalle) : null,
    ip: ipDeLaPeticion(event),
    creadoEn: Date.now(),
  }
}

/**
 * Prepara el registro de un evento en la bitácora (RNF25, RNF29).
 * Devuelve la consulta sin ejecutarla, para que pueda ir en el mismo `db.batch()`
 * que la operación que registra: o se guardan las dos o ninguna (RF110).
 */
export function eventoBitacora(event: H3Event, evento: Evento) {
  return usarBd(event).insert(bitacora).values(valores(event, evento))
}

/**
 * Igual que eventoBitacora, pero el evento solo se guarda si `tabla` tiene una fila que cumple `donde`.
 * Sirve cuando la operación puede no aplicarse (por ejemplo, una edición rechazada porque alguien más
 * guardó antes): así la bitácora nunca registra un cambio que no ocurrió.
 *
 * Genera `INSERT INTO bitacora (...) SELECT <valores> FROM tabla WHERE donde` (SQL estándar): si
 * ninguna fila cumple la condición, no se inserta nada.
 */
export function eventoBitacoraSi(event: H3Event, evento: Evento, tabla: SQLiteTable, donde: SQL) {
  const db = usarBd(event)
  const v = valores(event, evento)
  const campos = Object.fromEntries(Object.entries(v).map(([columna, valor]) => [columna, sql`${valor}`.as(columna)]))
  return db.insert(bitacora).select(db.select(campos as Record<keyof typeof v, SQL.Aliased>).from(tabla).where(donde))
}
