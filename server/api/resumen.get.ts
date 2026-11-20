import { and, eq, sql } from 'drizzle-orm'
import { creditos, solicitudes, usuarios } from '../db/esquema'

// RNF26, RNF27: alertas de la pantalla de inicio: cobros de hoy, atrasos, solicitudes por revisar y
// créditos aprobados que falta entregar.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const db = usarBd(event)
  const ambitoSolicitudes = actor.rol === 'cobrador'
    ? eq(solicitudes.cobradorId, actor.id)
    : actor.rol === 'gerente' ? eq(usuarios.gerenteId, actor.id) : undefined

  const [cobranza, [pendientes], [porDesembolsar]] = await Promise.all([
    situacionCobranza(db, actor),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(solicitudes)
      .innerJoin(usuarios, eq(solicitudes.cobradorId, usuarios.id))
      .where(and(eq(solicitudes.estado, 'pendiente'), ambitoSolicitudes)),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(creditos)
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(and(eq(creditos.estado, 'aprobado'), ambitoCreditos(actor))),
  ])

  const cobrarHoy = cobranza.filter((c) => c.estado === 'vence_hoy' || c.estado === 'atrasado')
  return {
    vigentes: cobranza.length,
    cobrarHoy: cobrarHoy.length,
    porCobrarHoyCentavos: cobrarHoy.reduce((t, c) => t + c.porCobrarHoyCentavos, 0),
    atrasados: cobranza.filter((c) => c.estado === 'atrasado').length,
    morosos: cobranza.filter((c) => c.morosidad === 'moroso' || c.morosidad === 'cartera_vencida').length,
    solicitudesPendientes: pendientes?.total ?? 0,
    porDesembolsar: porDesembolsar?.total ?? 0,
  }
})
