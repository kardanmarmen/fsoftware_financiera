import { type SQL, desc, eq, or } from 'drizzle-orm'
import { documentos, usuarios } from '../db/esquema'

/** Lista de documentos (sin la ubicación interna del archivo) que cumplen `donde`. */
export function listaDocumentos(db: BaseDatos, donde: SQL) {
  return db
    .select({
      id: documentos.id,
      tipo: documentos.tipo,
      nombreArchivo: documentos.nombreArchivo,
      tipoMime: documentos.tipoMime,
      tamanoBytes: documentos.tamanoBytes,
      solicitudId: documentos.solicitudId,
      creditoId: documentos.creditoId,
      subidoPorNombre: usuarios.nombre,
      subidoEn: documentos.subidoEn,
    })
    .from(documentos)
    .innerJoin(usuarios, eq(documentos.subidoPor, usuarios.id))
    .where(donde)
    .orderBy(desc(documentos.subidoEn))
}

/** Documentos de un crédito: los suyos y los de la solicitud que lo generó (RF20). */
export const documentosDelCredito = (creditoId: string, solicitudId: string) =>
  or(eq(documentos.creditoId, creditoId), eq(documentos.solicitudId, solicitudId))!
