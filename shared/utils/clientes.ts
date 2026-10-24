import { z } from 'zod'

// Este archivo lo usan las páginas y la API: las mismas reglas validan el formulario y la petición.

export const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
] as const

// RN-20: formato oficial de la CURP (RENAPO). Posiciones:
// 1-4 letras del nombre · 5-10 fecha AAMMDD · 11 sexo (H, M o X) · 12-13 estado (NE = extranjero)
// 14-16 consonantes internas · 17 diferenciador de siglo · 18 dígito verificador
const FORMATO_CURP =
  /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/

/**
 * ¿El último dígito de la CURP coincide con el que se calcula de los otros 17? (algoritmo de RENAPO)
 * Detecta la mayoría de los errores al teclear, como dos caracteres invertidos.
 */
export function digitoVerificadorValido(curp: string) {
  const DICCIONARIO = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
  let suma = 0
  for (let i = 0; i < 17; i++) suma += DICCIONARIO.indexOf(curp[i]!) * (18 - i)
  return (10 - (suma % 10)) % 10 === Number(curp[17])
}

/**
 * Fecha de nacimiento (AAAA-MM-DD) que viene en la CURP, o null si la fecha no existe (RN-21).
 * La posición 17 indica el siglo: un número para 1900–1999 y una letra para 2000 en adelante.
 */
export function fechaDeCurp(curp: string): string | null {
  const siglo = /\d/.test(curp[16] ?? '') ? '19' : '20'
  const fecha = `${siglo}${curp.slice(4, 6)}-${curp.slice(6, 8)}-${curp.slice(8, 10)}`
  const d = new Date(`${fecha}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(fecha) ? fecha : null
}

// Palabras que la CURP se brinca al tomar las iniciales (instructivo de RENAPO)
const PARTICULAS = ['DA', 'DAS', 'DE', 'DEL', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LA', 'LOS', 'LAS', 'LE', 'LES', 'MAC', 'MC', 'VAN', 'VON', 'Y']
const NOMBRES_COMUNES = ['MARIA', 'MA', 'MA.', 'JOSE', 'J', 'J.']

function primeraLetra(texto: string | null | undefined, brincar: string[]) {
  const palabras = (texto ?? '')
    .toUpperCase()
    .replace(/Ñ/g, 'X') // la CURP usa X en lugar de Ñ
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const util = palabras.filter((p) => !brincar.includes(p))
  // Si todo eran palabras a brincar (p. ej. el nombre es solo "María"), se usa la primera
  return (util[0] ?? palabras[0] ?? '')[0] ?? ''
}

/**
 * Compara la CURP con el nombre capturado y regresa avisos si no parecen de la misma persona.
 * Solo avisa, no bloquea: la CURP tiene excepciones (palabras altisonantes, nombres extranjeros)
 * que un cálculo no cubre. Una X en la CURP nunca se marca, porque RENAPO la usa para esos casos.
 */
export function avisosCurp(curp: string, c: { nombre: string, apellidoPaterno: string, apellidoMaterno?: string | null }) {
  const avisos: string[] = []
  const comparar = (posicion: number, esperada: string, campo: string) => {
    const letra = curp[posicion - 1]
    if (esperada && letra && letra !== 'X' && letra !== esperada) {
      avisos.push(`La letra ${posicion} de la CURP es "${letra}", pero ${campo} empieza con "${esperada}"`)
    }
  }
  comparar(1, primeraLetra(c.apellidoPaterno, PARTICULAS), 'el apellido paterno')
  // Sin apellido materno, la CURP lleva X en la posición 3
  if (c.apellidoMaterno?.trim()) comparar(3, primeraLetra(c.apellidoMaterno, PARTICULAS), 'el apellido materno')
  comparar(4, primeraLetra(c.nombre, [...PARTICULAS, ...NOMBRES_COMUNES]), 'el nombre')
  return avisos
}

/** Nombre en minúsculas, sin acentos y empezando por los apellidos: "perez lopez maria" (2.1, 4.2). */
export function nombreParaBusqueda(c: { nombre: string, apellidoPaterno: string, apellidoMaterno?: string | null }) {
  return [c.apellidoPaterno, c.apellidoMaterno, c.nombre]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los acentos (á → a); la ñ queda como n
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** "María Pérez López" */
export function nombreCompleto(c: { nombre: string, apellidoPaterno: string, apellidoMaterno?: string | null }) {
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ')
}

// Texto obligatorio: sin espacios de más y con un máximo de caracteres
const texto = (campo: string, max: number) =>
  z.string().trim().min(1, `Escribe ${campo}`).max(max, `Máximo ${max} caracteres`).transform((t) => t.replace(/\s+/g, ' '))

// Texto opcional: vacío se guarda como null
const opcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).transform((t) => t || null).nullish()

// RN-22
const telefono = z.string().trim().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos')

export const esquemaCliente = z.object({
  curp: z
    .string()
    .trim()
    .toUpperCase()
    .length(18, 'La CURP tiene 18 caracteres')
    .regex(FORMATO_CURP, 'La CURP no tiene un formato válido')
    .refine((c) => fechaDeCurp(c) !== null, 'La fecha de nacimiento de la CURP no existe')
    .refine(digitoVerificadorValido, 'La CURP tiene un error: revisa que esté bien escrita'),
  nombre: texto('el nombre', 80),
  apellidoPaterno: texto('el apellido paterno', 80),
  apellidoMaterno: opcional(80),
  telefono,
  telefonoAlterno: z.union([telefono, z.literal('')]).transform((t) => t || null).nullish(),
  correo: z.union([z.email('El correo no es válido'), z.literal('')]).transform((c) => c || null).nullish(),
  calle: texto('la calle', 150),
  numeroExterior: texto('el número exterior', 20),
  numeroInterior: opcional(20),
  colonia: texto('la colonia', 100),
  municipio: texto('el municipio', 100),
  estado: z.enum(ESTADOS_MEXICO, { error: 'Elige el estado' }),
  codigoPostal: z.string().trim().regex(/^\d{5}$/, 'El código postal debe tener 5 dígitos'),
  referenciasDomicilio: opcional(500),
  notas: opcional(1000),
})

// Al registrar, el Gerente elige a cuál de sus Cobradores se asigna; el Cobrador no lo envía.
export const esquemaNuevoCliente = esquemaCliente.extend({
  cobradorId: z.uuid({ error: 'Elige el Cobrador' }).optional(),
})

// Al editar se envía la fecha de la última modificación que vio el usuario: si alguien más guardó
// cambios mientras tanto, la edición se rechaza en lugar de borrarlos (RNF05).
export const esquemaEditarCliente = esquemaCliente.extend({
  actualizadoEn: z.number().int(),
})

export type CampoCliente = keyof z.output<typeof esquemaCliente>

// Nombres de los campos para mostrar qué cambió (bitácora, RN-26)
export const NOMBRE_CAMPO_CLIENTE: Record<CampoCliente, string> = {
  curp: 'CURP',
  nombre: 'nombre',
  apellidoPaterno: 'apellido paterno',
  apellidoMaterno: 'apellido materno',
  telefono: 'teléfono',
  telefonoAlterno: 'otro teléfono',
  correo: 'correo',
  calle: 'calle',
  numeroExterior: 'número exterior',
  numeroInterior: 'número interior',
  colonia: 'colonia',
  municipio: 'municipio',
  estado: 'estado',
  codigoPostal: 'código postal',
  referenciasDomicilio: 'referencias del domicilio',
  notas: 'notas',
}
