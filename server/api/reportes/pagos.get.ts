import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientes, creditos, operaciones, usuarios } from '../../db/esquema'

// RF64–RF72, RF80: reporte de pagos, abonos y liquidaciones de un rango de fechas, con totales por Cobrador.
// Las correcciones (RF72) aparecen con monto negativo: restan lo que se había cobrado.
// La lista se limita a las 3,000 más recientes (para no mandar megas al celular); los totales son completos.
const LIMITE = 3000
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { desde, hasta } = leerConsulta(event, esquemaRangoFechas)
  const registro = alias(usuarios, 'registro')

  const db = usarBd(event)
  const filtro = and(
    inArray(operaciones.tipo, ['pago', 'abono', 'liquidacion', 'correccion']),
    gte(operaciones.registradoEn, inicioDelDia(desde)),
    lt(operaciones.registradoEn, finDelDia(hasta)),
    ambitoCreditos(actor),
  )
  // Las correcciones restan
  const signo = sql`CASE WHEN ${operaciones.tipo} = 'correccion' THEN -1 ELSE 1 END`

  const [filas, porCobrador] = await Promise.all([
    db
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
      .where(filtro)
      .orderBy(desc(operaciones.registradoEn))
      .limit(LIMITE + 1),
    // Totales en SQL: no dependen de cuántas filas se listan
    db
      .select({
        cobradorNombre: usuarios.nombre,
        operaciones: sql<number>`COUNT(*)`,
        montoCentavos: sql<number>`SUM(${signo} * ${operaciones.montoCentavos})`,
        moraCentavos: sql<number>`SUM(${signo} * ${operaciones.moraCentavos})`,
      })
      .from(operaciones)
      .innerJoin(creditos, eq(operaciones.creditoId, creditos.id))
      .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
      .where(filtro)
      .groupBy(usuarios.id),
  ])

  const pagos = filas.slice(0, LIMITE).map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, ...f }) => ({
    ...f,
    montoCentavos: f.tipo === 'correccion' ? -f.montoCentavos : f.montoCentavos,
    moraCentavos: f.tipo === 'correccion' ? -f.moraCentavos : f.moraCentavos,
    clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
  }))
  const totales = porCobrador.map((c) => ({ ...c, operaciones: Number(c.operaciones), montoCentavos: Number(c.montoCentavos), moraCentavos: Number(c.moraCentavos) }))
  return {
    pagos,
    truncado: filas.length > LIMITE, // la lista muestra solo las más recientes; los totales son completos
    operaciones: totales.reduce((t, c) => t + c.operaciones, 0),
    totalCentavos: totales.reduce((t, c) => t + c.montoCentavos, 0),
    moraCentavos: totales.reduce((t, c) => t + c.moraCentavos, 0),
    porCobrador: totales.sort((a, b) => b.montoCentavos - a.montoCentavos),
  }
})
