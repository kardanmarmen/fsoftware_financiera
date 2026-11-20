import { asc, eq } from 'drizzle-orm'
import { calendarioPagos, type creditos, moras } from '../db/esquema'

type Credito = typeof creditos.$inferSelect

/**
 * Calendario y moras de un crédito, con las moras que faltan generar (RF73–RF77):
 * una por cada semana que ya venció (vencimiento anterior a hoy) sin estar cubierta por completo.
 * `nuevas` se guardan con `insertarMoras` en el mismo batch que la operación (o solas al consultar).
 */
export async function leerCalendarioYMoras(db: BaseDatos, credito: Credito, hoy = hoyEnMexico()) {
  const [calendario, existentes] = await Promise.all([
    db
      .select({
        semana: calendarioPagos.semana,
        fechaVencimiento: calendarioPagos.fechaVencimiento,
        montoCentavos: calendarioPagos.montoCentavos,
        cubiertoCentavos: calendarioPagos.cubiertoCentavos,
      })
      .from(calendarioPagos)
      .where(eq(calendarioPagos.creditoId, credito.id))
      .orderBy(asc(calendarioPagos.semana)),
    db
      .select({
        semana: moras.semana,
        montoCentavos: moras.montoCentavos,
        pagadoCentavos: moras.pagadoCentavos,
        condonadoCentavos: moras.condonadoCentavos,
      })
      .from(moras)
      .where(eq(moras.creditoId, credito.id))
      .orderBy(asc(moras.semana)),
  ])

  const conMora = new Set(existentes.map((m) => m.semana))
  const generaMoras = credito.estado === 'aceptado' && credito.moraSemanalCentavos > 0
  const nuevas = generaMoras
    ? calendario
        .filter((s) => s.fechaVencimiento < hoy && s.cubiertoCentavos < s.montoCentavos && !conMora.has(s.semana))
        .map((s) => ({ semana: s.semana, montoCentavos: credito.moraSemanalCentavos, pagadoCentavos: 0, condonadoCentavos: 0 }))
    : []
  const todas = [...existentes, ...nuevas].sort((a, b) => a.semana - b.semana)
  return {
    calendario,
    moras: todas,
    nuevas,
    moraPendienteCentavos: todas.reduce((t, m) => t + moraPendiente(m), 0),
  }
}

/**
 * Consultas para guardar las moras nuevas. Si otra petición ya las guardó, no pasa nada
 * (`mora_semana_unica`), así que pueden ir en cualquier batch sin condición.
 */
export function insertarMoras(db: BaseDatos, creditoId: string, nuevas: { semana: number, montoCentavos: number }[], ahora: number) {
  return nuevas.map((m) =>
    db
      .insert(moras)
      .values({ id: crypto.randomUUID(), creditoId, semana: m.semana, montoCentavos: m.montoCentavos, generadaEn: ahora })
      .onConflictDoNothing())
}
