import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientes, creditos, operaciones, usuarios } from '../../db/esquema'

// RF64–RF72, RF80: reporte de pagos, abonos y liquidaciones de un rango de fechas, con totales por Cobrador.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { desde, hasta } = leerConsulta(event, esquemaRangoFechas)
  const registro = alias(usuarios, 'registro')

  const filas = await usarBd(event)
    .select({
      operacionId: operaciones.id,
      folio: operaciones.folio,
      tipo: operaciones.tipo,
      semana: operaciones.semana,
      montoCentavos: operaciones.montoCentavos,
      moraCentavos: operaciones.moraCentavos,
      saldoResultanteCentavos: operaciones.saldoResultanteCentavos,
      registradoEn: operaciones.registradoEn,
      registradoPorNombre: registro.nombre,
      creditoId: creditos.id,
      creditoFolio: creditos.folio,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: usuarios.nombre,
    })
    .from(operaciones)
    .innerJoin(creditos, eq(operaciones.creditoId, creditos.id))
    .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
    .innerJoin(registro, eq(operaciones.registradoPor, registro.id))
    .where(and(
      inArray(operaciones.tipo, ['pago', 'abono', 'liquidacion']),
      gte(operaciones.registradoEn, inicioDelDia(desde)),
      lt(operaciones.registradoEn, finDelDia(hasta)),
      ambitoCreditos(actor),
    ))
    .orderBy(desc(operaciones.registradoEn))
    .limit(5000)

  const pagos = filas.map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, ...f }) => ({
    ...f,
    clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
  }))
  const porCobrador = new Map<string, { cobradorNombre: string, operaciones: number, montoCentavos: number, moraCentavos: number }>()
  for (const p of pagos) {
    const t = porCobrador.get(p.cobradorNombre) ?? { cobradorNombre: p.cobradorNombre, operaciones: 0, montoCentavos: 0, moraCentavos: 0 }
    t.operaciones++
    t.montoCentavos += p.montoCentavos
    t.moraCentavos += p.moraCentavos
    porCobrador.set(p.cobradorNombre, t)
  }
  return {
    pagos,
    totalCentavos: pagos.reduce((t, p) => t + p.montoCentavos, 0),
    moraCentavos: pagos.reduce((t, p) => t + p.moraCentavos, 0),
    porCobrador: [...porCobrador.values()].sort((a, b) => b.montoCentavos - a.montoCentavos),
  }
})
