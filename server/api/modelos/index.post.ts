import { modelosCredito } from '../../db/esquema'

// RF35–RF40: el Administrador define los modelos de crédito. Cambiar un modelo no afecta a las
// solicitudes ni a los créditos que ya existen: cada uno guarda una copia de sus condiciones (RF58).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador'] })
  const datos = await leerCuerpo(event, esquemaModelo)
  const db = usarBd(event)
  const ahora = Date.now()
  const id = crypto.randomUUID()

  try {
    await db.batch([
      db.insert(modelosCredito).values({
        id,
        nombre: datos.nombre,
        tipo: 'interes_fijo',
        tasaInteresBp: datos.tasaInteres,
        plazoSemanas: datos.plazoSemanas,
        moraSemanalCentavos: datos.moraSemanal,
        semanasParaRenovar: datos.semanasParaRenovar,
        creadoPor: actor.id,
        creadoEn: ahora,
        actualizadoEn: ahora,
      }),
      eventoBitacora(event, {
        usuarioId: actor.id,
        accion: 'modelo_creado',
        entidad: 'modelo_credito',
        entidadId: id,
        detalle: { ...datos },
      }),
    ])
  } catch (error) {
    if (esErrorDeDuplicado(error)) throw createError({ statusCode: 409, message: 'Ya existe un modelo con ese nombre' })
    throw error
  }

  setResponseStatus(event, 201)
  return { id }
})
