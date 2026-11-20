import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientes, creditos, operaciones, solicitudes, usuarios } from '../../db/esquema'

// RF82–RF89: reporte de renovaciones solicitadas en un rango de fechas: crédito anterior, crédito
// nuevo, lo que se descontó para liquidar el anterior y lo que recibió el cliente.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { desde, hasta } = leerConsulta(event, esquemaRangoFechas)
  const anterior = alias(creditos, 'anterior')
  const nuevo = alias(creditos, 'nuevo')
  const liquidacion = alias(operaciones, 'liquidacion')

  const filas = await usarBd(event)
    .select({
      solicitudId: solicitudes.id,
      estadoSolicitud: solicitudes.estado,
      creadoEn: solicitudes.creadoEn,
      montoSolicitadoCentavos: solicitudes.montoSolicitadoCentavos,
      clienteId: clientes.id,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: usuarios.nombre,
      anteriorId: anterior.id,
      anteriorFolio: anterior.folio,
      nuevoId: nuevo.id,
      nuevoFolio: nuevo.folio,
      nuevoEstado: nuevo.estado,
      nuevoMontoCentavos: nuevo.montoCentavos,
      descontadoCentavos: liquidacion.montoCentavos,
    })
    .from(solicitudes)
    .innerJoin(clientes, eq(solicitudes.clienteId, clientes.id))
    .innerJoin(usuarios, eq(solicitudes.cobradorId, usuarios.id))
    .innerJoin(anterior, eq(solicitudes.creditoAnteriorId, anterior.id))
    .leftJoin(nuevo, eq(nuevo.solicitudId, solicitudes.id))
    // La liquidación del anterior que se hizo con el desembolso del nuevo
    .leftJoin(liquidacion, and(eq(liquidacion.creditoId, anterior.id), eq(liquidacion.tipo, 'liquidacion')))
    .where(and(
      eq(solicitudes.tipo, 'renovacion'),
      gte(solicitudes.creadoEn, inicioDelDia(desde)),
      lt(solicitudes.creadoEn, finDelDia(hasta)),
      actor.rol === 'cobrador' ? eq(solicitudes.cobradorId, actor.id) : actor.rol === 'gerente' ? eq(usuarios.gerenteId, actor.id) : undefined,
    ))
    .orderBy(desc(solicitudes.creadoEn))
    .limit(5000)

  return filas.map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, ...f }) => {
    const desembolsado = f.nuevoEstado === 'aceptado' || f.nuevoEstado === 'liquidado'
    return {
      ...f,
      clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
      descontadoCentavos: desembolsado ? f.descontadoCentavos : null,
      entregadoCentavos: desembolsado && f.nuevoMontoCentavos != null ? f.nuevoMontoCentavos - (f.descontadoCentavos ?? 0) : null,
    }
  })
})
