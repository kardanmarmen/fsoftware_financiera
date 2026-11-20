import type { AnyD1Database } from 'drizzle-orm/d1'

// Límite de peticiones de Cloudflare (wrangler.jsonc > ratelimits).
interface LimitePeticiones {
  limit(opciones: { key: string }): Promise<{ success: boolean }>
}

// Lo que se usa de R2 (bucket de documentos).
interface ObjetoR2 {
  body: ReadableStream
  size: number
  httpMetadata?: { contentType?: string }
}
interface AlmacenR2 {
  put(clave: string, valor: ArrayBuffer | Uint8Array, opciones?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(clave: string): Promise<ObjetoR2 | null>
  delete(clave: string): Promise<void>
}

// Lo que Cloudflare entrega en cada petición (configurado en wrangler.jsonc).
declare module 'h3' {
  interface H3EventContext {
    cloudflare: {
      env: { DB: AnyD1Database, LIMITE_INICIO_SESION: LimitePeticiones, DOCUMENTOS: AlmacenR2 }
    }
  }
}

export {}
