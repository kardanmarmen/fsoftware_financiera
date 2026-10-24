import { asc, desc, eq } from 'drizzle-orm'
import { calendarioPagos, clientes, creditos, operaciones, usuarios } from '../../db/esquema'

// RF61, RF63: condiciones, saldo, calendario de pagos y operaciones de un crédito.
// Mismo ámbito que los clientes: Cobrador, sus créditos; Gerente, los de sus Cobradores; Administrador, todos.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const id = getRouterParam(event, 'id') ?? ''
  const db = usarBd(event)

  const fila = await db
    .select({
      credito: creditos,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: usuarios.nombre,
      gerenteId: usuarios.gerenteId,
    })
    .from(creditos)
    .innerJoin(clientes, eq(creditos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(creditos.cobradorId, usuarios.id))
    .where(eq(creditos.id, id))
    .get()

  const puedeVer = fila && (
    actor.rol === 'administrador'
    || (actor.rol === 'cobrador' && fila.credito.cobradorId === actor.id)
    || (actor.rol === 'gerente' && fila.gerenteId === actor.id)
  )
  // 404 también sin permiso: no revela que el crédito existe
  if (!puedeVer) throw createError({ statusCode: 404, message: 'Crédito no encontrado' })

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
    calendario,
    operaciones: historial,
  }
})
