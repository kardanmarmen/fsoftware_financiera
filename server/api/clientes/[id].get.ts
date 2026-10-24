import { desc, eq } from 'drizzle-orm'
import { creditos, solicitudes } from '../../db/esquema'

// RF11, RF15: ficha del cliente con su Cobrador responsable.
// RF14: historial de solicitudes y créditos. Los pagos, abonos y moras se consultan en cada crédito (RF63).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { cliente, cobradorNombre } = await obtenerClienteObjetivo(event, actor)
  const { nombreBusqueda: _, ...datos } = cliente
  const db = usarBd(event)

  const [listaCreditos, listaSolicitudes] = await Promise.all([
    db
      .select({
        id: creditos.id,
        folio: creditos.folio,
        estado: creditos.estado,
        montoCentavos: creditos.montoCentavos,
        totalCentavos: creditos.totalCentavos,
        saldoCentavos: creditos.saldoCentavos,
        plazoSemanas: creditos.plazoSemanas,
        fechaDesembolso: creditos.fechaDesembolso,
        liquidadoEn: creditos.liquidadoEn,
      })
      .from(creditos)
      .where(eq(creditos.clienteId, cliente.id))
      .orderBy(desc(creditos.creadoEn)),
    db
      .select({
        id: solicitudes.id,
        tipo: solicitudes.tipo,
        estado: solicitudes.estado,
        montoSolicitadoCentavos: solicitudes.montoSolicitadoCentavos,
        montoAprobadoCentavos: solicitudes.montoAprobadoCentavos,
        motivo: solicitudes.motivo,
        creadoEn: solicitudes.creadoEn,
      })
      .from(solicitudes)
      .where(eq(solicitudes.clienteId, cliente.id))
      .orderBy(desc(solicitudes.creadoEn)),
  ])

  return {
    ...datos,
    cobradorNombre,
    puedeEditar: puedeEditarCliente(actor),
    puedeCorregirCurp: actor.rol === 'gerente', // matriz 4.1
    // Los vigentes primero (RF15: créditos activos del cliente)
    creditos: listaCreditos.sort((a, b) => Number(b.estado === 'aceptado') - Number(a.estado === 'aceptado')),
    solicitudes: listaSolicitudes,
  }
})
