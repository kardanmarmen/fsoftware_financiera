// Aviso que ve el usuario cuando su sesión se cerró (RNF18).
// El servidor deja el motivo en una cookie corta y legible; la página de login lo muestra y la borra.

export const COOKIE_AVISO = 'aviso_sesion'

export const MENSAJE_CIERRE: Record<string, string> = {
  salida: 'Cerraste sesión. Inicia sesión de nuevo',
  nuevo_inicio: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo',
  domingo: 'Las sesiones se cierran cada domingo. Inicia sesión de nuevo',
  inactividad: 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo',
  desactivado: 'Tu cuenta está desactivada',
  restablecimiento: 'El Administrador restableció tu contraseña. Inicia sesión con la contraseña temporal',
  cambio_contrasena: 'Tu contraseña cambió. Inicia sesión de nuevo',
}
