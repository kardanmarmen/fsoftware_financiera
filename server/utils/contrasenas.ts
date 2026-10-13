import type { H3Event } from 'h3'

// Sin letras ni números que se confundan al dictarlos o leerlos (0/O, 1/l/I).
const CARACTERES = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** RN-12: la contraseña temporal vale 24 horas. */
export const VIGENCIA_TEMPORAL_MS = 24 * 60 * 60 * 1000

/** Genera una contraseña temporal aleatoria de 12 caracteres. */
export function generarContrasenaTemporal() {
  const aleatorios = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(aleatorios, (n) => CARACTERES[n % CARACTERES.length]).join('')
}

// --- Pepper (RNF23) ----------------------------------------------------------------------------
// Antes de scrypt, la contraseña se firma con HMAC-SHA256 usando una clave secreta (el pepper) que
// NO está en la base de datos: está en el secreto NUXT_PASSWORD_PEPPER de Cloudflare (y en .env
// en desarrollo). Si alguien roba solo la base, los hashes no le sirven para adivinar contraseñas.
//
// Los hashes con pepper se guardan con la marca "pepper1$" al inicio. Los que no la tienen (los
// anteriores al pepper y los de los scripts crear-admin y restablecer-admin) se aceptan y se
// convierten al iniciar sesión.

const MARCA_PEPPER = 'pepper1$'
let claveHmac: { pepper: string, clave: CryptoKey } | undefined

async function aplicarPepper(event: H3Event, contrasena: string) {
  const { passwordPepper } = useRuntimeConfig(event)
  if (!passwordPepper) {
    // Mejor fallar que guardar contraseñas sin la protección del pepper.
    throw createError({ statusCode: 500, message: 'Falta configurar NUXT_PASSWORD_PEPPER en el servidor' })
  }
  if (claveHmac?.pepper !== passwordPepper) {
    const clave = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passwordPepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    claveHmac = { pepper: passwordPepper, clave }
  }
  const firma = await crypto.subtle.sign('HMAC', claveHmac.clave, new TextEncoder().encode(contrasena))
  return btoa(String.fromCharCode(...new Uint8Array(firma)))
}

/** Hash para guardar en la base: pepper + scrypt. */
export async function hashearContrasena(event: H3Event, contrasena: string) {
  return MARCA_PEPPER + (await hashPassword(await aplicarPepper(event, contrasena)))
}

/**
 * Compara una contraseña con su hash guardado.
 * `debeActualizar` indica que es correcta pero su hash es de un formato anterior (sin pepper o con
 * otro costo de scrypt): conviene volver a guardarla con hashearContrasena().
 */
export async function verificarContrasena(event: H3Event, hashGuardado: string, contrasena: string) {
  if (hashGuardado.startsWith(MARCA_PEPPER)) {
    const hash = hashGuardado.slice(MARCA_PEPPER.length)
    const valido = await verifyPassword(hash, await aplicarPepper(event, contrasena))
    return { valido, debeActualizar: valido && passwordNeedsReHash(hash) }
  }
  // Hash sin pepper: anterior al pepper o creado por un script.
  const valido = await verifyPassword(hashGuardado, contrasena)
  return { valido, debeActualizar: valido }
}
