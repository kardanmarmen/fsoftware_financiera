// Sin letras ni números que se confundan al dictarlos o leerlos (0/O, 1/l/I).
const CARACTERES = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** RN-12: la contraseña temporal vale 24 horas. */
export const VIGENCIA_TEMPORAL_MS = 24 * 60 * 60 * 1000

/** Genera una contraseña temporal aleatoria de 12 caracteres. */
export function generarContrasenaTemporal() {
  const aleatorios = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(aleatorios, (n) => CARACTERES[n % CARACTERES.length]).join('')
}
