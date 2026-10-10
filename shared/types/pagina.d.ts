import type { Rol } from '../utils/usuarios'

declare module '#app' {
  interface PageMeta {
    /** Roles que pueden ver la página. Si se omite, cualquier usuario con sesión. */
    roles?: Rol[]
  }
}

export {}
