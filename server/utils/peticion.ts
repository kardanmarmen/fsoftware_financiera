import type { H3Event } from 'h3'

/** IP del visitante. En Cloudflare viene en el encabezado cf-connecting-ip. */
export function ipDeLaPeticion(event: H3Event) {
  return getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? null
}
