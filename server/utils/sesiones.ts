import { and, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { sesiones, usuarios, type MotivoCierre, type Usuario } from '../db/esquema'

const MINUTO = 60 * 1000
const DIA = 24 * 60 * MINUTO

/** RF07: una sesión sin actividad durante 3 días deja de ser válida. */
export const INACTIVIDAD_MS = 3 * DIA

/** RN-19: la última actividad se guarda como máximo cada 15 minutos (ahorra escrituras en D1). */
const ACTUALIZAR_ACTIVIDAD_MS = 15 * MINUTO

/** Mensaje que ve el usuario según el motivo por el que se cerró su sesión (RNF18). */
const MENSAJE_CIERRE: Record<MotivoCierre, string> = {
  salida: 'Cerraste sesión. Inicia sesión de nuevo',
  nuevo_inicio: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo',
  domingo: 'Las sesiones se cierran cada domingo. Inicia sesión de nuevo',
  inactividad: 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo',
  desactivado: 'Tu cuenta está desactivada',
  restablecimiento: 'El Administrador restableció tu contraseña. Inicia sesión con la contraseña temporal',
  cambio_contrasena: 'Tu contraseña cambió. Inicia sesión de nuevo',
}

/**
 * RF06 / RN-18: momento del último cierre dominical (domingo 03:00, hora del centro de México).
 * México usa UTC−6 todo el año, así que equivale al domingo 09:00 UTC.
 */
export function ultimoCierreDominical(ahora = Date.now()) {
  const fecha = new Date(ahora)
  const cierre = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() - fecha.getUTCDay(), 9)
  return cierre <= ahora ? cierre : cierre - 7 * DIA
}

/** Consulta que cierra la sesión abierta de un usuario (para usarla dentro de un `db.batch()`). */
export function cerrarSesionesDe(event: H3Event, usuarioId: string, motivo: MotivoCierre) {
  return usarBd(event)
    .update(sesiones)
    .set({ cerradaEn: Date.now(), motivoCierre: motivo })
    .where(and(eq(sesiones.usuarioId, usuarioId), isNull(sesiones.cerradaEn)))
}

/** Datos de la nueva sesión: quién, desde qué dispositivo y qué IP. */
export function nuevaSesion(event: H3Event, usuarioId: string) {
  const ahora = Date.now()
  return {
    id: crypto.randomUUID(),
    usuarioId,
    creadaEn: ahora,
    ultimaActividadEn: ahora,
    dispositivo: getRequestHeader(event, 'user-agent')?.slice(0, 300) ?? null,
    ip: getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? null,
  }
}

/** Borra la cookie y prepara el error 401 con el mensaje para el usuario. */
async function rechazar(event: H3Event, mensaje: string) {
  await clearUserSession(event)
  return createError({ statusCode: 401, message: mensaje })
}

/**
 * Valida la sesión de la petición contra la base de datos (diseño 1.2, sección 4).
 * La cookie solo dice qué sesión es; si está abierta lo decide la tabla `sesiones`.
 * Así, cerrar sesión o cualquier cierre automático invalida también las copias de la cookie.
 */
export async function validarSesion(event: H3Event): Promise<Usuario> {
  const { user, secure } = await getUserSession(event)
  if (!user || !secure?.sesionId) throw await rechazar(event, 'Inicia sesión para continuar')

  const db = usarBd(event)
  const [fila] = await db
    .select({ sesion: sesiones, usuario: usuarios })
    .from(sesiones)
    .innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
    .where(eq(sesiones.id, secure.sesionId))

  if (!fila || fila.usuario.id !== user.id) throw await rechazar(event, 'Inicia sesión para continuar')
  const { sesion, usuario } = fila
  if (sesion.cerradaEn) throw await rechazar(event, MENSAJE_CIERRE[sesion.motivoCierre ?? 'salida'])

  // Reglas de cierre automático, en orden (RF04, RF06, RF07).
  const ahora = Date.now()
  let motivo: MotivoCierre | null = null
  if (!usuario.activo) motivo = 'desactivado'
  else if (sesion.creadaEn < ultimoCierreDominical(ahora)) motivo = 'domingo'
  else if (ahora - sesion.ultimaActividadEn > INACTIVIDAD_MS) motivo = 'inactividad'

  if (motivo) {
    await db.batch([
      db.update(sesiones).set({ cerradaEn: ahora, motivoCierre: motivo }).where(eq(sesiones.id, sesion.id)),
      eventoBitacora(event, {
        usuarioId: usuario.id,
        gerenteId: usuario.gerenteId,
        accion: 'sesion_expirada',
        detalle: { motivo },
      }),
    ])
    throw await rechazar(event, MENSAJE_CIERRE[motivo])
  }

  if (ahora - sesion.ultimaActividadEn > ACTUALIZAR_ACTIVIDAD_MS) {
    await db.update(sesiones).set({ ultimaActividadEn: ahora }).where(eq(sesiones.id, sesion.id))
  }
  return usuario
}
