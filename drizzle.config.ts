import { defineConfig } from 'drizzle-kit'

// Drizzle solo genera los archivos .sql de migración; wrangler los aplica en D1.
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/esquema.ts',
  out: './server/db/migraciones',
})
