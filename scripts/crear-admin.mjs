// Crea el primer Administrador con una contraseña temporal (vence en 24 horas).
//
// Uso:
//   npm run crear-admin -- <usuario> "<Nombre completo>"            (base local)
//   npm run crear-admin -- <usuario> "<Nombre completo>" --remoto   (base en Cloudflare)
//
// Usa la misma librería y configuración que nuxt-auth-utils (scrypt de @adonisjs/hash),
// así el hash es compatible con verifyPassword() del servidor.
import { randomInt, randomUUID } from 'node:crypto'
import { unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

const [usuarioArg, nombre, bandera] = process.argv.slice(2)
const remoto = bandera === '--remoto'
const usuario = (usuarioArg ?? '').trim().toLowerCase()

if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || !nombre?.trim()) {
  console.error('Uso: npm run crear-admin -- <usuario> "<Nombre completo>" [--remoto]')
  console.error('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.')
  process.exit(1)
}

const CARACTERES = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const temporal = Array.from({ length: 12 }, () => CARACTERES[randomInt(CARACTERES.length)]).join('')
const hash = await new Hash(new Scrypt({})).make(temporal)

const ahora = Date.now()
const texto = (valor) => `'${String(valor).replaceAll("'", "''")}'`
const sql = `INSERT INTO usuarios
  (id, usuario, nombre, rol, gerente_id, contrasena_hash, contrasena_temporal, temporal_expira_en, activo, creado_por, creado_en, actualizado_en)
VALUES
  (${texto(randomUUID())}, ${texto(usuario)}, ${texto(nombre.trim())}, 'administrador', NULL, ${texto(hash)}, 1, ${ahora + 24 * 60 * 60 * 1000}, 1, NULL, ${ahora}, ${ahora});
`

const archivo = 'crear-admin.sql'
writeFileSync(archivo, sql)
const comando = `npx wrangler d1 execute financiera ${remoto ? '--remote' : '--local'} --file=${archivo}`
const resultado = spawnSync(comando, { stdio: 'inherit', shell: true })
unlinkSync(archivo) // el archivo contiene el hash; no se deja en disco

if (resultado.status !== 0) {
  console.error('\nNo se pudo crear el Administrador (¿ya existe ese usuario? ¿aplicaste las migraciones?).')
  process.exit(1)
}

console.log(`\nAdministrador "${usuario}" creado en la base ${remoto ? 'de Cloudflare' : 'local'}.`)
console.log(`Contraseña temporal: ${temporal}`)
console.log('Vence en 24 horas. Al entrar, el sistema pedirá elegir una contraseña nueva.')
