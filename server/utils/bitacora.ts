import type { H3Event } from 'h3'
import { bitacora } from '../db/esquema'

interface Evento {
  usuarioId?: string | null
  gerenteId?: string | null
  usuarioIntentado?: string
  accion: string
  entidad?: string
  entidadId?: string
  detalle?: Record<string, unknown>
}

/**
 * Prepara el registro de un evento en la bitácora (RNF25, RNF29).
 * Devuelve la consulta sin ejecutarla, para que pueda ir en el mismo `db.batch()`
 * que la operación que registra: o se guardan las dos o ninguna (RF110).
 */
export function eventoBitacora(event: H3Event, evento: Evento) {
  return usarBd(event).insert(bitacora).values({
    id: crypto.randomUUID(),
    usuarioId: evento.usuarioId ?? null,
    gerenteId: evento.gerenteId ?? null,
    usuarioIntentado: evento.usuarioIntentado ?? null,
    accion: evento.accion,
    entidad: evento.entidad ?? null,
    entidadId: evento.entidadId ?? null,
    detalle: evento.detalle ? JSON.stringify(evento.detalle) : null,
    ip: getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? null,
    creadoEn: Date.now(),
  })
}
