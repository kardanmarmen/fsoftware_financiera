import { eq } from 'drizzle-orm'
import { cobradorModelos } from '../db/esquema'

/**
 * RF27: modelos que puede usar un Cobrador. Si su Gerente no le ha asignado ninguno, puede usar todos
 * los activos (`null`); en cuanto tiene alguno asignado, solo esos.
 */
export async function modelosPermitidos(db: BaseDatos, cobradorId: string) {
  const filas = await db.select({ modeloId: cobradorModelos.modeloId }).from(cobradorModelos).where(eq(cobradorModelos.cobradorId, cobradorId))
  return filas.length ? filas.map((f) => f.modeloId) : null
}
