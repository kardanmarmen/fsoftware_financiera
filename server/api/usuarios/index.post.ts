import { usuarios } from '../../db/esquema'

// RF24 (Cobradores) y RF30 (Gerentes). Todo usuario nuevo empieza con contraseña temporal.
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['administrador', 'gerente'] })
  const datos = await leerCuerpo(event, esquemaNuevoUsuario)

  let gerenteId: string | null = null
  if (actor.rol === 'gerente') {
    // El Gerente solo crea Cobradores, y quedan a su cargo (RN-03).
    if (datos.rol !== 'cobrador') {
      throw createError({ statusCode: 403, message: 'Solo puedes registrar Cobradores' })
    }
    gerenteId = actor.id
  } else if (datos.rol === 'cobrador') {
    // El Administrador elige el Gerente del Cobrador (RN-02).
    if (!datos.gerenteId) {
      throw createError({ statusCode: 400, message: 'Elige el Gerente del Cobrador' })
    }
    gerenteId = (await validarGerenteActivo(event, datos.gerenteId)).id
  }

  const contrasenaTemporal = generarContrasenaTemporal()
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = usarBd(event)

  try {
    await db.batch([
      db.insert(usuarios).values({
        id,
        usuario: datos.usuario,
        nombre: datos.nombre,
        rol: datos.rol,
        gerenteId,
        contrasenaHash: await hashPassword(contrasenaTemporal),
        contrasenaTemporal: true,
        temporalExpiraEn: ahora + VIGENCIA_TEMPORAL_MS,
        creadoPor: actor.id,
        creadoEn: ahora,
        actualizadoEn: ahora,
      }),
      eventoBitacora(event, {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: 'usuario_creado',
        entidad: 'usuario',
        entidadId: id,
        detalle: { usuario: datos.usuario, nombre: datos.nombre, rol: datos.rol, gerenteId },
      }),
    ])
  } catch (error) {
    if (esErrorDeDuplicado(error)) {
      throw createError({ statusCode: 409, message: `El usuario "${datos.usuario}" ya existe` })
    }
    throw error
  }

  setResponseStatus(event, 201)
  // La contraseña temporal se muestra una sola vez; en la base solo queda su hash (RN-11).
  return { id, usuario: datos.usuario, contrasenaTemporal }
})
