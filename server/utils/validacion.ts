import type { H3Event } from 'h3'
import type { z } from 'zod'

/**
 * Lee el cuerpo de la petición y lo valida con un esquema de Zod.
 * Si no es válido, responde 400 con el primer mensaje en español (RNF18).
 */
export async function leerCuerpo<T extends z.ZodType>(event: H3Event, esquema: T): Promise<z.output<T>> {
  const resultado = esquema.safeParse(await readBody(event))
  if (!resultado.success) {
    throw createError({ statusCode: 400, message: resultado.error.issues[0]?.message ?? 'Datos inválidos' })
  }
  return resultado.data
}
