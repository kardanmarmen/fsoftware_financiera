// Fechas guardadas en milisegundos, mostradas en hora del centro de México.
export function formatearFecha(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

// Fechas sin hora (AAAA-MM-DD), como la de nacimiento: "01/05/1990".
export function formatearFechaCorta(fecha: string | null | undefined) {
  if (!fecha) return '—'
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

// Dinero guardado en centavos: 500000 → "$5,000.00"
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
export function formatearDinero(centavos: number | null | undefined) {
  return centavos == null ? '—' : PESOS.format(centavos / 100)
}

// Porcentaje guardado en centésimas de punto: 2000 → "20 %", 1250 → "12.5 %"
export function formatearPorcentaje(bp: number) {
  return `${(bp / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`
}

export const NOMBRE_ESTADO_CREDITO: Record<string, string> = {
  aprobado: 'Aprobado',
  aceptado: 'Vigente',
  liquidado: 'Liquidado',
  cancelado: 'Cancelado',
}

export const NOMBRE_ESTADO_SOLICITUD: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
}

export const NOMBRE_TIPO_OPERACION: Record<string, string> = {
  desembolso: 'Desembolso',
  pago: 'Pago',
  abono: 'Abono',
  liquidacion: 'Liquidación',
  correccion: 'Corrección',
}

export const NOMBRE_ACCION: Record<string, string> = {
  inicio_sesion: 'Inicio de sesión',
  inicio_sesion_fallido: 'Inicio de sesión fallido',
  cierre_sesion: 'Cierre de sesión',
  sesion_expirada: 'Cierre automático de sesión',
  usuario_creado: 'Alta de usuario',
  usuario_modificado: 'Modificación de usuario',
  usuario_activado: 'Activación de usuario',
  usuario_desactivado: 'Desactivación de usuario',
  cobrador_reasignado: 'Reasignación de Cobrador',
  contrasena_restablecida: 'Restablecimiento de contraseña',
  contrasena_cambiada: 'Cambio de contraseña',
  cliente_creado: 'Alta de cliente',
  cliente_modificado: 'Modificación de cliente',
}

export const NOMBRE_MOTIVO_CIERRE: Record<string, string> = {
  domingo: 'cierre semanal',
  inactividad: 'inactividad',
  desactivado: 'cuenta desactivada',
}
