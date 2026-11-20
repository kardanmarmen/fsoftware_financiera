import { desc, eq } from 'drizzle-orm'
import { operaciones } from '../db/esquema'

/**
 * RF72: operación que se puede corregir ahora: el último pago, abono o liquidación del crédito que
 * no esté corregido. Solo la última, para que al revertirla se devuelvan exactamente las semanas y
 * moras que cubrió; para corregir una anterior se corrigen primero las más recientes.
 * No se corrigen desembolsos ni la liquidación hecha por una renovación (va unida a otro crédito).
 */
export async function operacionCorregible(db: BaseDatos, creditoId: string) {
  const lista = await db
    .select({
      id: operaciones.id,
      tipo: operaciones.tipo,
      operacionCorregidaId: operaciones.operacionCorregidaId,
      claveIdempotencia: operaciones.claveIdempotencia,
    })
    .from(operaciones)
    .where(eq(operaciones.creditoId, creditoId))
    .orderBy(desc(operaciones.registradoEn), desc(operaciones.folio))

  const corregidas = new Set(lista.map((o) => o.operacionCorregidaId).filter(Boolean))
  const ultima = lista.find((o) => o.tipo !== 'correccion' && !corregidas.has(o.id))
  if (!ultima || !['pago', 'abono', 'liquidacion'].includes(ultima.tipo)) return null
  if (ultima.claveIdempotencia.endsWith(':renovacion')) return null
  return ultima.id
}
