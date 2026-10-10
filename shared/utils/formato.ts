// Fechas guardadas en milisegundos, mostradas en hora del centro de México.
export function formatearFecha(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export const NOMBRE_ACCION: Record<string, string> = {
  inicio_sesion: 'Inicio de sesión',
  inicio_sesion_fallido: 'Inicio de sesión fallido',
  cierre_sesion: 'Cierre de sesión',
  usuario_creado: 'Alta de usuario',
  usuario_modificado: 'Modificación de usuario',
  usuario_activado: 'Activación de usuario',
  usuario_desactivado: 'Desactivación de usuario',
  cobrador_reasignado: 'Reasignación de Cobrador',
  contrasena_restablecida: 'Restablecimiento de contraseña',
  contrasena_cambiada: 'Cambio de contraseña',
}
