import { eq } from 'drizzle-orm'
import { documentos } from '../../db/esquema'

// RF23, RF105: el bucket es privado; los documentos solo se descargan por aquí, después de revisar
// que el usuario pueda ver al cliente (mismo ámbito que la ficha del cliente).
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const id = getRouterParam(event, 'id') ?? ''
  const documento = await usarBd(event).query.documentos.findFirst({ where: eq(documentos.id, id) })
  if (!documento) throw createError({ statusCode: 404, message: 'Documento no encontrado' })
  await obtenerClienteObjetivo(event, actor, documento.clienteId) // 404 si no puede verlo

  const objeto = await event.context.cloudflare.env.DOCUMENTOS.get(documento.claveArchivo)
  if (!objeto) throw createError({ statusCode: 404, message: 'El archivo no está en el almacenamiento' })

  setResponseHeaders(event, {
    'content-type': documento.tipoMime,
    'content-length': objeto.size,
    // inline: el navegador lo muestra (foto o PDF); el nombre se usa si se descarga
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(documento.nombreArchivo)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
  return objeto.body
})
