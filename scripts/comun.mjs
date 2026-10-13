// Funciones compartidas por los scripts de administración (crear-admin, restablecer-admin).
import { randomInt } from 'node:crypto'
import { unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

// Misma configuración que el servidor (nuxt.config.ts > auth.hash.scrypt), así el hash es
// compatible con verifyPassword() y no hay que volver a calcularlo en el primer inicio de sesión.
const hash = new Hash(new Scrypt({ cost: 1024 }))

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

/** Ejecuta wrangler y devuelve su respuesta JSON. */
function wrangler(argumentos, remoto) {
  const comando = `npx wrangler d1 execute financiera ${remoto ? '--remote' : '--local'} --json ${argumentos}`
  const resultado = spawnSync(comando, { shell: true, encoding: 'utf8' })
  if (resultado.status !== 0) {
    console.error(resultado.stdout || resultado.stderr)
    throw new Error('Falló la ejecución en D1 (¿aplicaste las migraciones?)')
  }
  // En remoto, wrangler escribe mensajes de progreso ("Uploading...") antes del JSON.
  return JSON.parse(resultado.stdout.slice(resultado.stdout.search(/^\[/m)))
}

/**
 * Ejecuta sentencias que modifican datos (INSERT, UPDATE). Van en un archivo para que D1 las
 * ejecute juntas, y el archivo se borra al terminar porque puede contener hashes de contraseñas.
 * En remoto, D1 no devuelve filas al ejecutar un archivo: para leer datos usa consultarSql().
 */
export function ejecutarSql(sql, remoto) {
  const archivo = 'script-temporal.sql'
  writeFileSync(archivo, sql)
  try {
    return wrangler(`--file=${archivo}`, remoto)
  } finally {
    unlinkSync(archivo)
  }
}

/** Ejecuta un SELECT y devuelve sus filas. Solo para consultas sin datos sensibles ni comillas dobles. */
export function consultarSql(sql, remoto) {
  return wrangler(`--command "${sql}"`, remoto)[0].results
}

/**
 * Lee los argumentos: <usuario> [nombre] [--remoto | --sql]
 * --sql: no ejecuta nada; imprime el SQL para pegarlo en la consola de D1 del panel de Cloudflare.
 */
export function leerArgumentos() {
  const args = process.argv.slice(2)
  const remoto = args.includes('--remoto')
  const soloSql = args.includes('--sql')
  const [usuario = '', nombre] = args.filter((a) => !a.startsWith('--'))
  return { usuario: usuario.trim().toLowerCase(), nombre: nombre?.trim(), remoto, soloSql }
}

/** Imprime el SQL y cómo usarlo en el panel de Cloudflare (modo --sql). */
export function imprimirSql(sql, temporal) {
  console.log('Copia y pega este SQL en Cloudflare: D1 SQL Database > financiera > Explore Data > Query\n')
  console.log('------------------------------------------------------------------')
  console.log(sql.trim())
  console.log('------------------------------------------------------------------\n')
  console.log(`Contraseña temporal: ${temporal}`)
  console.log('Vence en 24 horas desde ahora. Al entrar, el sistema pedirá elegir una contraseña nueva.')
  console.log('Presiona Run (si hay varias sentencias, ejecuta todas). Si no se modificó ninguna fila, el usuario no existe.')
}

export const USUARIO_VALIDO = /^[a-z0-9._-]{3,30}$/
