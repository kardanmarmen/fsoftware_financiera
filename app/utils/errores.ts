/** Mensaje legible de un error de la API para mostrarlo al usuario (RNF18). */
export function mensajeDeError(error: unknown) {
  const e = error as { data?: { message?: string } }
  return e?.data?.message || 'Ocurrió un error. Intenta de nuevo.'
}
