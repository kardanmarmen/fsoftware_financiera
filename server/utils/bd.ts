import { getTableColumns, type SQL, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import * as esquema from '../db/esquema'

/** Base de datos D1 de la petición, con Drizzle. */
export function usarBd(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB, { schema: esquema })
}

export type BaseDatos = ReturnType<typeof usarBd>

/** ¿El error es por repetir un valor UNIQUE (por ejemplo, un nombre de usuario)? */
export function esErrorDeDuplicado(error: unknown) {
  // Drizzle envuelve el error de D1; el mensaje original queda en `cause`.
  const e = error as { message?: string, cause?: { message?: string } }
  return [e?.message, e?.cause?.message].some((m) => m?.includes('UNIQUE constraint failed'))
}

/**
 * Inserta una fila en `tabla` solo si `desde` tiene una fila que cumple `donde`:
 * `INSERT INTO tabla (...) SELECT <valores> FROM desde WHERE donde` (SQL estándar).
 * Los valores pueden ser datos o expresiones SQL (por ejemplo, el folio que se acaba de tomar).
 * Se usa dentro de db.batch() para que una operación se aplique completa o no se aplique.
 * Deben venir todas las columnas de `tabla` (las que falten se guardan como NULL), en cualquier orden.
 */
export function insertarSi(db: BaseDatos, tabla: SQLiteTable, valores: Record<string, unknown>, desde: SQLiteTable, donde: SQL) {
  // Drizzle pide las columnas en el orden de la tabla
  const campos = Object.fromEntries(Object.keys(getTableColumns(tabla)).map((columna) => [columna, sql`${valores[columna]}`.as(columna)]))
  return db.insert(tabla).select(db.select(campos).from(desde).where(donde) as never)
}
