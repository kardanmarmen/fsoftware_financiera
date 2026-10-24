import { and, eq } from 'drizzle-orm'
import { clientes } from '../../db/esquema'

// RF12, RF13. Edita el Cobrador sus clientes y el Gerente los de sus Cobradores; solo el Gerente
// corrige la CURP. Cada cambio queda en la bitácora con el valor anterior y el nuevo (RN-26).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { cliente: anterior } = await obtenerClienteObjetivo(event, actor)
  const { actualizadoEn, ...datos } = await leerCuerpo(event, esquemaEditarCliente)

  if (datos.curp !== anterior.curp && actor.rol !== 'gerente') {
    throw createError({ statusCode: 403, message: 'Solo el Gerente puede corregir la CURP' })
  }

  // Solo los campos que cambiaron, con su valor anterior y el nuevo
  const antes: Record<string, unknown> = {}
  const despues: Record<string, unknown> = {}
  for (const campo of Object.keys(datos) as CampoCliente[]) {
    const nuevo = datos[campo] ?? null
    if (nuevo !== anterior[campo]) {
      antes[campo] = anterior[campo]
      despues[campo] = nuevo
    }
  }
  if (Object.keys(despues).length === 0) return { actualizadoEn: anterior.actualizadoEn } // sin cambios

  const db = usarBd(event)
  const ahora = Date.now()
  try {
    const [resultado] = await db.batch([
      db
        .update(clientes)
        .set({
          ...datos,
          nombreBusqueda: nombreParaBusqueda(datos),
          fechaNacimiento: fechaDeCurp(datos.curp)!, // el esquema ya validó que la fecha existe
          actualizadoEn: ahora,
        })
        // RNF05: solo si nadie lo modificó desde que el usuario abrió el formulario
        .where(and(eq(clientes.id, anterior.id), eq(clientes.actualizadoEn, actualizadoEn))),
      // La bitácora solo se escribe si el cliente realmente se actualizó (misma transacción)
      eventoBitacoraSi(
        event,
        {
          usuarioId: actor.id,
          gerenteId: actor.gerenteId,
          accion: 'cliente_modificado',
          entidad: 'cliente',
          entidadId: anterior.id,
          detalle: { antes, despues },
        },
        clientes,
        and(eq(clientes.id, anterior.id), eq(clientes.actualizadoEn, ahora))!,
      ),
    ])
    if (resultado.meta.changes === 0) {
      throw createError({
        statusCode: 409,
        message: 'Otra persona modificó este cliente mientras lo editabas. Recarga la página para ver sus cambios.',
      })
    }
  } catch (error) {
    if (esErrorDeDuplicado(error)) {
      throw createError({ statusCode: 409, message: 'Ya existe otro cliente con esa CURP' })
    }
    throw error
  }

  return { actualizadoEn: ahora }
})
