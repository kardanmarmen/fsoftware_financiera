import { and, eq } from 'drizzle-orm'
import { creditos, documentos, solicitudes } from '../../../db/esquema'
import { TAMANO_MAXIMO_DOCUMENTO, TIPOS_ARCHIVO_DOCUMENTO } from '../../../../shared/utils/creditos'

const EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'application/pdf': '.pdf',
}

// RF17–RF22: el Cobrador (o su Gerente) sube un documento del cliente, opcionalmente ligado a una
// solicitud o a un crédito. El archivo llega como cuerpo crudo (no multipart): así el Worker no tiene
// que procesarlo y no gasta CPU (límite de 10 ms del plan gratuito). Nunca se reemplaza un documento:
// otra versión es un documento nuevo (RF19).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event, { roles: ['gerente', 'cobrador'] })
  const { cliente } = await obtenerClienteObjetivo(event, actor)
  const datos = leerConsulta(event, esquemaSubirDocumento)
  const db = usarBd(event)

  const tipoMime = (getRequestHeader(event, 'content-type') ?? '').split(';')[0]!.trim()
  if (!(TIPOS_ARCHIVO_DOCUMENTO as readonly string[]).includes(tipoMime)) {
    throw createError({ statusCode: 415, message: 'Solo se aceptan fotos (JPG, PNG, WEBP, HEIC) o PDF' })
  }
  const declarado = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declarado > TAMANO_MAXIMO_DOCUMENTO) throw createError({ statusCode: 413, message: 'El archivo pesa más de 10 MB' })

  // La solicitud o el crédito deben ser de este cliente
  if (datos.solicitudId && !(await db.query.solicitudes.findFirst({ where: and(eq(solicitudes.id, datos.solicitudId), eq(solicitudes.clienteId, cliente.id)) }))) {
    throw createError({ statusCode: 400, message: 'La solicitud no es de este cliente' })
  }
  if (datos.creditoId && !(await db.query.creditos.findFirst({ where: and(eq(creditos.id, datos.creditoId), eq(creditos.clienteId, cliente.id)) }))) {
    throw createError({ statusCode: 400, message: 'El crédito no es de este cliente' })
  }

  const archivo = await readRawBody(event, false)
  if (!archivo?.length) throw createError({ statusCode: 400, message: 'El archivo está vacío' })
  if (archivo.length > TAMANO_MAXIMO_DOCUMENTO) throw createError({ statusCode: 413, message: 'El archivo pesa más de 10 MB' })

  const id = crypto.randomUUID()
  const claveArchivo = `clientes/${cliente.id}/${id}${EXTENSION[tipoMime]}`
  const almacen = event.context.cloudflare.env.DOCUMENTOS
  await almacen.put(claveArchivo, archivo, { httpMetadata: { contentType: tipoMime } })

  try {
    await db.batch([
      db.insert(documentos).values({
        id,
        clienteId: cliente.id,
        solicitudId: datos.solicitudId ?? null,
        creditoId: datos.creditoId ?? null,
        tipo: datos.tipo,
        claveArchivo,
        nombreArchivo: datos.nombre,
        tipoMime,
        tamanoBytes: archivo.length,
        subidoPor: actor.id,
        subidoEn: Date.now(),
      }),
      eventoBitacora(event, {
        usuarioId: actor.id,
        gerenteId: actor.gerenteId,
        accion: 'documento_subido',
        entidad: 'cliente',
        entidadId: cliente.id,
        detalle: { documentoId: id, tipo: datos.tipo, nombre: datos.nombre, creditoId: datos.creditoId, solicitudId: datos.solicitudId },
      }),
    ])
  } catch (error) {
    await almacen.delete(claveArchivo) // sin registro, el archivo no sirve: no dejarlo huérfano
    throw error
  }

  setResponseStatus(event, 201)
  return { id }
})
