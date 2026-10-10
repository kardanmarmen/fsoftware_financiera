import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { usuarios, type Usuario } from '../db/esquema'
import type { Rol } from '../../shared/utils/usuarios'

interface Opciones {
  /** Roles que pueden usar la ruta. Si se omite, cualquier usuario con sesión. */
  roles?: Rol[]
  /** Permite la ruta aunque el usuario tenga contraseña temporal (solo para cambiarla). */
  permitirTemporal?: boolean
}

/**
 * Verifica la sesión y los permisos al inicio de cada ruta protegida (RF03, RF04).
 * Lee al usuario de la base en cada petición: si lo desactivaron, pierde el acceso al momento.
 * En la tarea 1.4 aquí se agregan las reglas de sesión (única, domingo, inactividad).
 */
export async function requerirUsuario(event: H3Event, opciones: Opciones = {}): Promise<Usuario> {
  const { user } = await getUserSession(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Inicia sesión para continuar' })
  }
  const usuario = await usarBd(event).query.usuarios.findFirst({ where: eq(usuarios.id, user.id) })

  if (!usuario || !usuario.activo) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Tu cuenta está desactivada' })
  }
  if (usuario.contrasenaTemporal && !opciones.permitirTemporal) {
    throw createError({ statusCode: 403, message: 'Debes cambiar tu contraseña antes de continuar' })
  }
  if (opciones.roles && !opciones.roles.includes(usuario.rol)) {
    throw createError({ statusCode: 403, message: 'No tienes permiso para esta acción' })
  }
  return usuario
}

/**
 * ¿`actor` puede editar, activar o desactivar a `objetivo`? (matriz de permisos, 1.2)
 * - Administrador: Gerentes y Cobradores (no otros Administradores).
 * - Gerente: solo sus Cobradores (RN-03).
 */
export function puedeAdministrar(actor: Usuario, objetivo: Usuario) {
  if (actor.id === objetivo.id) return false // RN-07
  if (actor.rol === 'administrador') return objetivo.rol !== 'administrador'
  if (actor.rol === 'gerente') return objetivo.rol === 'cobrador' && objetivo.gerenteId === actor.id
  return false
}

/** ¿`actor` puede ver a `objetivo`? (RF28, RF32) */
export function puedeVer(actor: Usuario, objetivo: Usuario) {
  return actor.rol === 'administrador' || actor.id === objetivo.id || puedeAdministrar(actor, objetivo)
}

/** Datos del usuario que se guardan en la cookie de sesión. */
export function datosDeSesion(usuario: Usuario) {
  return {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    contrasenaTemporal: usuario.contrasenaTemporal,
  }
}
