import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { clientes, creditos, operaciones, solicitudes, usuarios } from '../../db/esquema'

// RF97–RF103: historial de liquidaciones de un rango de fechas: normales, anticipadas y por renovación,
// con el comprobante de cada una.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { desde, hasta } = leerConsulta(event, esquemaRangoFechas)

  const filas = await usarBd(event)
    .select({
      creditoId: creditos.id,
      folio: creditos.folio,
      montoCentavos: creditos.montoCentavos,
      totalCentavos: creditos.totalCentavos,
      tipoLiquidacion: creditos.tipoLiquidacion,
      liquidadoEn: creditos.liquidadoEn,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: usuarios.nombre,
      operacionId: operaciones.id,
      operacionFolio: operaciones.folio,
      pagadoCentavos: operaciones.montoCentavos,
      porRenovacion: sql<number>`EXISTS (SELECT 1 FROM ${solicitudes} WHERE ${solicitudes.creditoAnteriorId} = ${creditos.id} AND ${solicitudes.estado} = 'aprobada')`,
    })
    .from(creditos)
    .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
    .leftJoin(operaciones, and(eq(operaciones.creditoId, creditos.id), eq(operaciones.tipo, 'liquidacion')))
    .where(and(
      eq(creditos.estado, 'liquidado'),
      gte(creditos.liquidadoEn, inicioDelDia(desde)),
      lt(creditos.liquidadoEn, finDelDia(hasta)),
      ambitoCreditos(actor),
    ))
    .orderBy(desc(creditos.liquidadoEn))
    .limit(5000)

  return filas.map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, porRenovacion, ...f }) => ({
    ...f,
    porRenovacion: Boolean(porRenovacion),
    clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
  }))
})
