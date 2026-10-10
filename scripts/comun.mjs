// Funciones compartidas por los scripts de administración (crear-admin, restablecer-admin).
import { randomInt } from 'node:crypto'
import { unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

// Misma configuración que nuxt-auth-utils, así el hash es compatible con verifyPassword() del servidor.
const hash = new Hash(new Scrypt({}))

/** RN-12: la contraseña temporal vale 24 horas. */
export const VIGENCIA_TEMPORAL_MS = 24 * 60 * 60 * 1000

/** Contraseña temporal de 12 caracteres, sin letras ni números que se confundan (0/O, 1/l/I). */
export function generarContrasenaTemporal() {
  const caracteres = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 12 }, () => caracteres[randomInt(caracteres.length)]).join('')
}

export const hashear = (contrasena) => hash.make(contrasena)

/** Valor de texto para SQL, con las comillas escapadas. */
export const texto = (valor) => `'${String(valor).replaceAll("'", "''")}'`

/**
 * Ejecuta SQL en D1 (local o en Cloudflare) y devuelve los resultados de cada sentencia.
 * El archivo temporal se borra al terminar porque puede contener hashes de contraseñas.
 */
export function ejecutarSql(sql, remoto) {
  const archivo = 'script-temporal.sql'
  writeFileSync(archivo, sql)
  const comando = `npx wrangler d1 execute financiera ${remoto ? '--remote' : '--local'} --json --file=${archivo}`
  const resultado = spawnSync(comando, { shell: true, encoding: 'utf8' })
  unlinkSync(archivo)

  if (resultado.status !== 0) {
    console.error(resultado.stdout || resultado.stderr)
    throw new Error('Falló la ejecución en D1 (¿aplicaste las migraciones?)')
  }
  return JSON.parse(resultado.stdout)
}

/** Lee los argumentos: <usuario> [nombre] [--remoto] */
export function leerArgumentos() {
  const args = process.argv.slice(2)
  const remoto = args.includes('--remoto')
  const [usuario = '', nombre] = args.filter((a) => a !== '--remoto')
  return { usuario: usuario.trim().toLowerCase(), nombre: nombre?.trim(), remoto }
}

export const USUARIO_VALIDO = /^[a-z0-9._-]{3,30}$/
