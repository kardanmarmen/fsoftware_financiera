import { and, desc, eq, ne } from 'drizzle-orm'
import { creditos, modelosCredito, operaciones, solicitudes, usuarios } from '../../../db/esquema'

// RF61, RF63: condiciones, saldo, calendario de pagos, moras y operaciones de un crédito.
// Mismo ámbito que los clientes: Cobrador, sus créditos; Gerente, los de sus Cobradores; Administrador, todos.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const fila = await obtenerCreditoObjetivo(event, actor)
  const credito = fila.credito
  const db = usarBd(event)

  const datos = await leerCalendarioYMoras(db, credito)
  // RF75: las semanas que vencieron sin pagarse generan su mora al consultarse
  if (datos.nuevas.length) await db.batch(insertarMoras(db, credito.id, datos.nuevas, Date.now()) as [ReturnType<typeof insertarMoras>[number]])

  const [historial, solicitud, renovacion, modelo, corregible] = await Promise.all([
    db
      .select({
        id: operaciones.id,
        folio: operaciones.folio,
        tipo: operaciones.tipo,
        semana: operaciones.semana,
        montoCentavos: operaciones.montoCentavos,
        moraCentavos: operaciones.moraCentavos,
        saldoResultanteCentavos: operaciones.saldoResultanteCentavos,
        motivo: operaciones.motivo,
        operacionCorregidaId: operaciones.operacionCorregidaId,
        registradoPorNombre: usuarios.nombre,
        registradoEn: operaciones.registradoEn,
      })
      .from(operaciones)
      .innerJoin(usuarios, eq(operaciones.registradoPor, usuarios.id))
      .where(eq(operaciones.creditoId, credito.id))
      .orderBy(desc(operaciones.registradoEn)),
    // Si este crédito es una renovación, el crédito que liquida (RF86)
    db
      .select({ tipo: solicitudes.tipo, anteriorId: creditos.id, anteriorFolio: creditos.folio })
      .from(solicitudes)
      .leftJoin(creditos, eq(solicitudes.creditoAnteriorId, creditos.id))
      .where(eq(solicitudes.id, credito.solicitudId))
      .get(),
    // Renovación de este crédito en curso (solicitud pendiente o crédito nuevo por desembolsar)
    db
      .select({ estado: solicitudes.estado, creditoNuevoId: creditos.id, creditoNuevoFolio: creditos.folio, creditoNuevoEstado: creditos.estado })
      .from(solicitudes)
      .leftJoin(creditos, eq(creditos.solicitudId, solicitudes.id))
      .where(and(eq(solicitudes.creditoAnteriorId, credito.id), ne(solicitudes.estado, 'rechazada')))
      .orderBy(desc(solicitudes.creadoEn))
      .get(),
    db.query.modelosCredito.findFirst({ where: eq(modelosCredito.id, credito.modeloId) }),
    actor.rol === 'gerente' ? operacionCorregible(db, credito.id) : null, // RF72
  ])
  const docs = await listaDocumentos(db, documentosDelCredito(credito.id, credito.solicitudId))
  const corregidas = new Set(historial.map((o) => o.operacionCorregidaId).filter(Boolean))

  const pagadas = semanasPagadas(datos.calendario)
  return {
    ...credito,
    clienteNombre: nombreCompleto({
      nombre: fila.clienteNombre,
      apellidoPaterno: fila.clienteApellidoPaterno,
      apellidoMaterno: fila.clienteApellidoMaterno,
    }),
    cobradorNombre: fila.cobradorNombre,
    puedeOperar: puedeOperarCredito(actor),
    puedeCondonar: actor.rol === 'gerente',
    calendario: datos.calendario,
    moras: datos.moras,
    moraPendienteCentavos: datos.moraPendienteCentavos,
    diasAtraso: diasDeAtraso(datos.calendario.find((s) => s.cubiertoCentavos < s.montoCentavos)?.fechaVencimiento, hoyEnMexico()),
    semanasPagadas: pagadas,
    semanasParaRenovar: modelo?.semanasParaRenovar ?? 0,
    creditoAnterior: solicitud?.tipo === 'renovacion' && solicitud.anteriorId ? { id: solicitud.anteriorId, folio: solicitud.anteriorFolio! } : null,
    renovacion: renovacion ?? null,
    operacionCorregibleId: corregible,
    documentos: docs,
    operaciones: historial.map((o) => ({ ...o, corregida: corregidas.has(o.id) })),
  }
})
