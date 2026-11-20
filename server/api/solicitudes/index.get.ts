import { and, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { clientes, ESTADOS_SOLICITUD, modelosCredito, solicitudes, usuarios } from '../../db/esquema'

const esquemaFiltros = z.object({ estado: z.enum(ESTADOS_SOLICITUD).optional() })

// RF46, RF49: solicitudes. Cobrador, las suyas; Gerente, las de sus Cobradores; Administrador, todas.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { estado } = leerConsulta(event, esquemaFiltros)
  const cobrador = alias(usuarios, 'cobrador')

  const filas = await usarBd(event)
    .select({
      id: solicitudes.id,
      clienteId: solicitudes.clienteId,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
      clienteApellidoMaterno: clientes.apellidoMaterno,
      cobradorNombre: cobrador.nombre,
      modeloNombre: modelosCredito.nombre,
      tipo: solicitudes.tipo,
      estado: solicitudes.estado,
      montoSolicitadoCentavos: solicitudes.montoSolicitadoCentavos,
      montoAprobadoCentavos: solicitudes.montoAprobadoCentavos,
      ocupacion: solicitudes.ocupacion,
      ingresoSemanalCentavos: solicitudes.ingresoSemanalCentavos,
      tasaInteresBp: solicitudes.tasaInteresBp,
      plazoSemanas: solicitudes.plazoSemanas,
      fechaDesembolso: solicitudes.fechaDesembolso,
      motivo: solicitudes.motivo,
      creadoEn: solicitudes.creadoEn,
    })
    .from(solicitudes)
    .innerJoin(clientes, eq(solicitudes.clienteId, clientes.id))
    .innerJoin(cobrador, eq(solicitudes.cobradorId, cobrador.id))
    .innerJoin(modelosCredito, eq(solicitudes.modeloId, modelosCredito.id))
    .where(and(
      estado ? eq(solicitudes.estado, estado) : undefined,
      actor.rol === 'cobrador' ? eq(solicitudes.cobradorId, actor.id) : undefined,
      actor.rol === 'gerente' ? eq(cobrador.gerenteId, actor.id) : undefined,
    ))
    .orderBy(desc(solicitudes.creadoEn))
    .limit(200)

  return filas.map(({ clienteNombre, clienteApellidoPaterno, clienteApellidoMaterno, ...s }) => ({
    ...s,
    clienteNombre: nombreCompleto({ nombre: clienteNombre, apellidoPaterno: clienteApellidoPaterno, apellidoMaterno: clienteApellidoMaterno }),
  }))
})
