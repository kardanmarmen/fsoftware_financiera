import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { calendarioPagos, creditos, modelosCredito, solicitudes, type Usuario, usuarios } from '../db/esquema'

/**
 * Solicitud del parámetro `:id` que el Gerente puede revisar: solo las de sus Cobradores (RF46).
 * Responde 404 también sin permiso, para no revelar que existe.
 */
export async function obtenerSolicitudParaRevisar(event: H3Event, actor: Usuario) {
  const id = getRouterParam(event, 'id') ?? ''
  const fila = await usarBd(event)
    .select({ solicitud: solicitudes, gerenteId: usuarios.gerenteId })
    .from(solicitudes)
    .innerJoin(usuarios, eq(solicitudes.cobradorId, usuarios.id))
    .where(eq(solicitudes.id, id))
    .get()
  if (!fila || fila.gerenteId !== actor.id) throw createError({ statusCode: 404, message: 'Solicitud no encontrada' })
  if (fila.solicitud.estado !== 'pendiente') {
    throw createError({ statusCode: 409, message: 'Esta solicitud ya fue revisada' })
  }
  return fila.solicitud
}

/**
 * ¿El cliente puede pedir un crédito? (RF41, RF82–RF85)
 * - No, si tiene una solicitud pendiente o un crédito aprobado sin desembolsar.
 * - Si tiene un crédito vigente, solo como renovación y cuando ya pagó las semanas que pide su
 *   modelo (`semanas_para_renovar`, RF83). El crédito nuevo liquida al anterior al desembolsarse.
 */
export async function revisarNuevaSolicitud(db: BaseDatos, clienteId: string) {
  const [pendiente, abiertos] = await Promise.all([
    db.query.solicitudes.findFirst({ where: and(eq(solicitudes.clienteId, clienteId), eq(solicitudes.estado, 'pendiente')) }),
    db
      .select({ credito: creditos, semanasParaRenovar: modelosCredito.semanasParaRenovar })
      .from(creditos)
      .innerJoin(modelosCredito, eq(creditos.modeloId, modelosCredito.id))
      .where(and(eq(creditos.clienteId, clienteId), inArray(creditos.estado, ['aprobado', 'aceptado']))),
  ])
  if (pendiente) return { permitido: false as const, motivo: 'El cliente ya tiene una solicitud pendiente' }
  if (abiertos.some((a) => a.credito.estado === 'aprobado')) {
    return { permitido: false as const, motivo: 'El cliente tiene un crédito aprobado sin desembolsar' }
  }
  const vigente = abiertos[0]
  if (!vigente) return { permitido: true as const, creditoAnterior: null }

  const calendario = await db
    .select({ montoCentavos: calendarioPagos.montoCentavos, cubiertoCentavos: calendarioPagos.cubiertoCentavos })
    .from(calendarioPagos)
    .where(eq(calendarioPagos.creditoId, vigente.credito.id))
  const pagadas = semanasPagadas(calendario)
  if (pagadas < vigente.semanasParaRenovar) {
    return {
      permitido: false as const,
      motivo: `Para renovar el crédito ${vigente.credito.folio} se necesitan ${vigente.semanasParaRenovar} semanas pagadas (lleva ${pagadas})`,
    }
  }
  return { permitido: true as const, creditoAnterior: vigente.credito }
}
