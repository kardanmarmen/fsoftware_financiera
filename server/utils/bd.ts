import { drizzle } from 'drizzle-orm/d1'
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
