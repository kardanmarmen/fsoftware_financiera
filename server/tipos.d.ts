import type { AnyD1Database } from 'drizzle-orm/d1'

// Lo que Cloudflare entrega en cada petición (configurado en wrangler.jsonc).
declare module 'h3' {
  interface H3EventContext {
    cloudflare: {
      env: { DB: AnyD1Database }
    }
  }
}

export {}
