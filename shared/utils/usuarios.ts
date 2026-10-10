import { z } from 'zod'

// Este archivo lo usan las páginas y la API: las mismas reglas validan el formulario y la petición.

export const ROLES = ['administrador', 'gerente', 'cobrador'] as const
export type Rol = (typeof ROLES)[number]

export const NOMBRE_ROL: Record<Rol, string> = {
  administrador: 'Administrador',
  gerente: 'Gerente',
  cobrador: 'Cobrador',
}

// RN-01
const usuario = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(30, 'Máximo 30 caracteres')
  .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo (sin espacios ni acentos)')

const nombre = z.string().trim().min(1, 'Escribe el nombre').max(150, 'Máximo 150 caracteres')

// RN-10
const contrasena = z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres')

export const esquemaIniciarSesion = z.object({
  usuario: z.string().trim().toLowerCase().min(1, 'Escribe tu usuario'),
  contrasena: z.string().min(1, 'Escribe tu contraseña'),
})

export const esquemaNuevoUsuario = z.object({
  usuario,
  nombre,
  rol: z.enum(['gerente', 'cobrador'], { error: 'Elige el rol' }),
  gerenteId: z.uuid().optional(), // solo el Administrador lo envía, al crear un Cobrador
})

export const esquemaEditarUsuario = z.object({ usuario, nombre })

export const esquemaReasignar = z.object({
  gerenteId: z.uuid({ error: 'Elige el nuevo Gerente' }),
})

export const esquemaCambiarContrasena = z
  .object({
    actual: z.string().min(1, 'Escribe tu contraseña actual'),
    nueva: contrasena,
    confirmacion: z.string(),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  })
  .refine((d) => d.nueva !== d.actual, {
    message: 'La nueva contraseña debe ser distinta a la actual',
    path: ['nueva'],
  })

// "Mi cuenta": solo el Administrador edita su propio nombre (supuesto del análisis 1.1).
export const esquemaMiCuenta = z.object({ nombre })
