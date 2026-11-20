import { and, eq, inArray } from 'drizzle-orm'
import { creditos, modelosCredito, solicitudes } from '../../db/esquema'

// RF41, RF42: el Cobrador (o su Gerente) captura la solicitud de un cliente. Las condiciones se
// copian del modelo; el Gerente las puede ajustar al aprobar (RF47, RF48).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const datos = await leerCuerpo(event, esquemaSolicitud)
  const { cliente } = await obtenerClienteObjetivo(event, actor, datos.clienteId)
  const db = usarBd(event)

  const [modelo, pendiente, vigente] = await Promise.all([
    db.query.modelosCredito.findFirst({ where: and(eq(modelosCredito.id, datos.modeloId), eq(modelosCredito.activo, true)) }),
    db.query.solicitudes.findFirst({ where: and(eq(solicitudes.clienteId, cliente.id), eq(solicitudes.estado, 'pendiente')) }),
    db.query.creditos.findFirst({
      where: and(eq(creditos.clienteId, cliente.id), inArray(creditos.estado, ['aprobado', 'aceptado'])),
    }),
  ])
  if (!modelo) throw createError({ statusCode: 400, message: 'El modelo de crédito no existe o está desactivado' })
  if (pendiente) throw createError({ statusCode: 409, message: 'El cliente ya tiene una solicitud pendiente' })
  // Las renovaciones (crédito nuevo sobre uno vigente) se construyen en el Incremento 5
  if (vigente) throw createError({ statusCode: 409, message: 'El cliente ya tiene un crédito vigente o por desembolsar' })

  const ahora = Date.now()
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(solicitudes).values({
      id,
      clienteId: cliente.id,
      cobradorId: cliente.cobradorId,
      modeloId: modelo.id,
      tipo: 'nueva',
      montoSolicitadoCentavos: datos.montoSolicitado,
      ocupacion: datos.ocupacion ?? null,
      ingresoSemanalCentavos: datos.ingresoSemanal ?? null,
      tasaInteresBp: modelo.tasaInteresBp,
      plazoSemanas: modelo.plazoSemanas,
      moraSemanalCentavos: modelo.moraSemanalCentavos,
      creadoPor: actor.id,
      creadoEn: ahora,
      actualizadoEn: ahora,
    }),
    eventoBitacora(event, {
      usuarioId: actor.id,
      gerenteId: actor.gerenteId,
      accion: 'solicitud_creada',
      entidad: 'solicitud',
      entidadId: id,
      detalle: { clienteId: cliente.id, modelo: modelo.nombre, montoSolicitadoCentavos: datos.montoSolicitado },
    }),
  ])

  setResponseStatus(event, 201)
  return { id }
})
