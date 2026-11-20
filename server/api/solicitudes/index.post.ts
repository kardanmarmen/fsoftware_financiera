import { and, eq } from 'drizzle-orm'
import { modelosCredito, solicitudes } from '../../db/esquema'

// RF41, RF42: el Cobrador (o su Gerente) captura la solicitud de un cliente. RF82–RF85: si el cliente
// tiene un crédito vigente que ya puede renovarse, la solicitud es una renovación. Las condiciones se
// copian del modelo; el Gerente las puede ajustar al aprobar (RF47, RF48).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const datos = await leerCuerpo(event, esquemaSolicitud)
  const { cliente } = await obtenerClienteObjetivo(event, actor, datos.clienteId)
  const db = usarBd(event)

  const [modelo, revision] = await Promise.all([
    db.query.modelosCredito.findFirst({ where: and(eq(modelosCredito.id, datos.modeloId), eq(modelosCredito.activo, true)) }),
    revisarNuevaSolicitud(db, cliente.id),
  ])
  if (!modelo) throw createError({ statusCode: 400, message: 'El modelo de crédito no existe o está desactivado' })
  // RF27: solo los modelos asignados al Cobrador del cliente (si tiene alguno asignado)
  const permitidos = await modelosPermitidos(db, cliente.cobradorId)
  if (permitidos && !permitidos.includes(modelo.id)) {
    throw createError({ statusCode: 400, message: 'Ese modelo de crédito no está asignado al Cobrador del cliente' })
  }
  if (!revision.permitido) throw createError({ statusCode: 409, message: revision.motivo })
  const anterior = revision.creditoAnterior

  const ahora = Date.now()
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(solicitudes).values({
      id,
      clienteId: cliente.id,
      cobradorId: cliente.cobradorId,
      modeloId: modelo.id,
      tipo: anterior ? 'renovacion' : 'nueva', // RF82: con un crédito vigente, es renovación
      creditoAnteriorId: anterior?.id ?? null,
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
      detalle: {
        clienteId: cliente.id,
        modelo: modelo.nombre,
        montoSolicitadoCentavos: datos.montoSolicitado,
        ...(anterior ? { renueva: anterior.folio } : {}),
      },
    }),
  ])

  setResponseStatus(event, 201)
  return { id }
})
