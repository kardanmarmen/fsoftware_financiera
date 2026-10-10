import type { Rol } from '../utils/usuarios'

// Datos guardados en la cookie de sesión (cifrada). Solo lo necesario para identificar al usuario.
declare module '#auth-utils' {
  interface User {
    id: string
    usuario: string
    nombre: string
    rol: Rol
    contrasenaTemporal: boolean
  }

  // Solo lo lee el servidor; nunca se envía al navegador.
  interface SecureSessionData {
    sesionId: string
  }
}

export {}
