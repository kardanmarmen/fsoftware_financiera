import { asc, desc, eq } from 'drizzle-orm'
import { calendarioPagos, operaciones, usuarios } from '../../../db/esquema'

// RF61, RF63: condiciones, saldo, calendario de pagos y operaciones de un crédito.
// Mismo ámbito que los clientes: Cobrador, sus créditos; Gerente, los de sus Cobradores; Administrador, todos.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const fila = await obtenerCreditoObjetivo(event, actor)
  const id = fila.credito.id
  const db = usarBd(event)

  const [calendario, historial] = await Promise.all([
    db
      .select({
        semana: calendarioPagos.semana,
        fechaVencimiento: calendarioPagos.fechaVencimiento,
        montoCentavos: calendarioPagos.montoCentavos,
        cubiertoCentavos: calendarioPagos.cubiertoCentavos,
      })
      .from(calendarioPagos)
      .where(eq(calendarioPagos.creditoId, id))
      .orderBy(asc(calendarioPagos.semana)),
    db
      .select({
        id: operaciones.id,
        folio: operaciones.folio,
        tipo: operaciones.tipo,
        semana: operaciones.semana,
        montoCentavos: operaciones.montoCentavos,
        saldoResultanteCentavos: operaciones.saldoResultanteCentavos,
        motivo: operaciones.motivo,
        registradoPorNombre: usuarios.nombre,
        registradoEn: operaciones.registradoEn,
      })
      .from(operaciones)
      .innerJoin(usuarios, eq(operaciones.registradoPor, usuarios.id))
      .where(eq(operaciones.creditoId, id))
      .orderBy(desc(operaciones.registradoEn)),
  ])

  return {
    ...fila.credito,
    clienteNombre: nombreCompleto({
      nombre: fila.clienteNombre,
      apellidoPaterno: fila.clienteApellidoPaterno,
      apellidoMaterno: fila.clienteApellidoMaterno,
    }),
    cobradorNombre: fila.cobradorNombre,
    puedeOperar: puedeOperarCredito(actor),
    calendario,
    operaciones: historial,
  }
})
