import type { AnyD1Database } from 'drizzle-orm/d1'

// Límite de peticiones de Cloudflare (wrangler.jsonc > ratelimits).
interface LimitePeticiones {
  limit(opciones: { key: string }): Promise<{ success: boolean }>
}

// Lo que Cloudflare entrega en cada petición (configurado en wrangler.jsonc).
declare module 'h3' {
  interface H3EventContext {
    cloudflare: {
      env: { DB: AnyD1Database, LIMITE_INICIO_SESION: LimitePeticiones }
    }
  }
}

export {}
