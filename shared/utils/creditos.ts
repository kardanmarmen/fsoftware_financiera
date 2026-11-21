import { z } from 'zod'

// Este archivo lo usan las páginas y la API: las mismas reglas validan el formulario y la petición.
// Los formularios capturan pesos y porcentajes; la API los convierte a centavos y centésimas de punto
// (convenciones del diseño 2.1). Por eso las páginas envían lo capturado, no `evento.data`.

/** Fecha de hoy en el centro de México, AAAA-MM-DD. */
export function hoyEnMexico() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const conDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6

/** Pesos con hasta dos decimales → centavos. */
const pesos = (campo: string, max = 10_000_000) =>
  z
    .number({ error: `Escribe ${campo}` })
    .positive(`${campo[0]!.toUpperCase()}${campo.slice(1)} debe ser mayor que cero`)
    .max(max, `Máximo ${max.toLocaleString('es-MX')} pesos`)
    .refine(conDosDecimales, 'Máximo dos decimales')
    .transform((n) => Math.round(n * 100))

/** Porcentaje con hasta dos decimales → centésimas de punto (20 → 2000). */
const porcentaje = z
  .number({ error: 'Escribe la tasa de interés' })
  .min(0, 'La tasa no puede ser negativa')
  .max(500, 'Máximo 500 %')
  .refine(conDosDecimales, 'Máximo dos decimales')
  .transform((n) => Math.round(n * 100))

const plazo = z
  .number({ error: 'Escribe el plazo' })
  .int('El plazo es en semanas completas')
  .min(1, 'Mínimo 1 semana')
  .max(104, 'Máximo 104 semanas')

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha')

const motivo = z.string().trim().min(1, 'Escribe el motivo').max(500, 'Máximo 500 caracteres')

// RN-24: la página genera la clave al abrir el formulario; un reintento repite la misma.
const claveIdempotencia = z.uuid()

// RF35–RF40: modelos de crédito
export const esquemaModelo = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(80, 'Máximo 80 caracteres'),
  tasaInteres: porcentaje,
  plazoSemanas: plazo,
  moraSemanal: z
    .number({ error: 'Escribe la mora semanal (0 si no cobra)' })
    .min(0, 'La mora no puede ser negativa')
    .max(100_000, 'Máximo 100,000 pesos')
    .refine(conDosDecimales, 'Máximo dos decimales')
    .transform((n) => Math.round(n * 100)),
  semanasParaRenovar: z.number({ error: 'Escribe las semanas' }).int().min(0).max(104),
})

export const esquemaActivarModelo = z.object({ activo: z.boolean() })

// RF41, RF42: solicitud de crédito
export const esquemaSolicitud = z.object({
  clienteId: z.uuid(),
  modeloId: z.uuid({ error: 'Elige el modelo de crédito' }),
  montoSolicitado: pesos('el monto solicitado'),
  ocupacion: z.string().trim().max(100, 'Máximo 100 caracteres').transform((t) => t || null).nullish(),
  ingresoSemanal: z
    .number()
    .min(0, 'El ingreso no puede ser negativo')
    .max(10_000_000)
    .refine(conDosDecimales, 'Máximo dos decimales')
    .nullish()
    .transform((n) => (n == null ? null : Math.round(n * 100))),
})

// RF47–RF52: el Gerente puede ajustar monto, tasa y plazo antes de aprobar
export const esquemaAprobarSolicitud = z.object({
  montoAprobado: pesos('el monto aprobado'),
  tasaInteres: porcentaje,
  plazoSemanas: plazo,
  fechaDesembolso: fecha,
})

export const esquemaRechazarSolicitud = z.object({ motivo })

// RF94: desembolso. La fecha no puede ser futura (se revisa en la API con la fecha de México).
export const esquemaDesembolso = z.object({ fecha, claveIdempotencia })

// RF96: el cliente no recibió el dinero
export const esquemaCancelarCredito = z.object({ motivo })

// RF64–RF68: pago o abono
export const esquemaPago = z.object({ monto: pesos('el monto'), claveIdempotencia })

// RF97–RF99: liquidación del saldo completo
export const esquemaLiquidacion = z.object({ claveIdempotencia })

/**
 * Modelo de interés fijo (diseño 2.1, sección 3.5):
 * interés = monto × tasa; pago semanal = total / plazo, redondeado hacia abajo al peso;
 * la diferencia va en la última semana. La semana 1 vence 7 días después del desembolso.
 */
export function calcularCredito(montoCentavos: number, tasaInteresBp: number, plazoSemanas: number, fechaDesembolso: string) {
  const interesCentavos = Math.round((montoCentavos * tasaInteresBp) / 10_000)
  const totalCentavos = montoCentavos + interesCentavos
  const pagoSemanalCentavos = Math.floor(totalCentavos / plazoSemanas / 100) * 100
  const calendario = Array.from({ length: plazoSemanas }, (_, i) => ({
    semana: i + 1,
    fechaVencimiento: sumarDias(fechaDesembolso, 7 * (i + 1)),
    montoCentavos: i === plazoSemanas - 1 ? totalCentavos - pagoSemanalCentavos * (plazoSemanas - 1) : pagoSemanalCentavos,
  }))
  return { interesCentavos, totalCentavos, pagoSemanalCentavos, calendario }
}

interface Semana { semana: number, montoCentavos: number, cubiertoCentavos: number }

/**
 * Reparte un pago entre las semanas, de la más antigua sin cubrir en adelante (RF65, RF66, RF68).
 * Regresa las semanas que cambian con su nuevo `cubiertoCentavos`, y si es pago (la última semana
 * tocada quedó completa) o abono (quedó una semana a medias).
 */
export function aplicarPago(calendario: Semana[], montoCentavos: number) {
  let resto = montoCentavos
  const cambios: { semana: number, cubiertoCentavos: number }[] = []
  for (const s of [...calendario].sort((a, b) => a.semana - b.semana)) {
    if (resto === 0) break
    const falta = s.montoCentavos - s.cubiertoCentavos
    if (falta === 0) continue
    const aplica = Math.min(falta, resto)
    resto -= aplica
    cambios.push({ semana: s.semana, cubiertoCentavos: s.cubiertoCentavos + aplica })
  }
  const ultima = cambios.at(-1)
  const completa = ultima && ultima.cubiertoCentavos === calendario.find((s) => s.semana === ultima.semana)!.montoCentavos
  return {
    cambios,
    sobrante: resto, // > 0 si el pago es mayor que lo que falta
    tipo: completa ? ('pago' as const) : ('abono' as const),
    semana: cambios[0]?.semana ?? null,
  }
}

interface Mora { semana: number, montoCentavos: number, pagadoCentavos: number, condonadoCentavos: number }

/** Lo que falta pagar de una mora. */
export const moraPendiente = (m: Mora) => m.montoCentavos - m.pagadoCentavos - m.condonadoCentavos

/**
 * Un pago cubre primero las moras pendientes, de la más antigua a la más reciente (RF76);
 * lo que sobra se aplica a las semanas con `aplicarPago`.
 */
export function aplicarAMoras(moras: Mora[], montoCentavos: number) {
  let resto = montoCentavos
  const cambios: { semana: number, pagadoCentavos: number }[] = []
  for (const m of [...moras].sort((a, b) => a.semana - b.semana)) {
    if (resto === 0) break
    const aplica = Math.min(moraPendiente(m), resto)
    if (aplica === 0) continue
    resto -= aplica
    cambios.push({ semana: m.semana, pagadoCentavos: m.pagadoCentavos + aplica })
  }
  return { cambios, aplicadoCentavos: montoCentavos - resto }
}

/** RF83: semanas completamente pagadas (para saber si ya puede renovar). */
export function semanasPagadas(calendario: { montoCentavos: number, cubiertoCentavos: number }[]) {
  return calendario.filter((s) => s.cubiertoCentavos >= s.montoCentavos).length
}

/** RF73, RF74: días de atraso desde el vencimiento más antiguo sin cubrir (0 si está al corriente). */
export function diasDeAtraso(vencimientoMasAntiguo: string | null | undefined, hoy: string) {
  if (!vencimientoMasAntiguo || vencimientoMasAntiguo >= hoy) return 0
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${vencimientoMasAntiguo}T00:00:00Z`)) / 86_400_000)
}

// RF79: el Gerente condona (perdona) la mora pendiente de un crédito, con motivo
export const esquemaCondonarMora = z.object({ motivo })

// Reportes (RF80, RF88, RF97–RF103): rango de fechas AAAA-MM-DD
export const esquemaRangoFechas = z
  .object({ desde: fecha, hasta: fecha })
  .refine((f) => f.desde <= f.hasta, { message: 'La fecha "desde" debe ser anterior o igual a "hasta"' })

// RF77, RF78: nivel de morosidad según los días de atraso
export const NIVELES_MOROSIDAD = {
  al_corriente: 'Al corriente',
  atraso: 'Atraso (1 a 7 días)',
  moroso: 'Moroso (8 a 29 días)',
  cartera_vencida: 'Cartera vencida (30 días o más)',
} as const
export type NivelMorosidad = keyof typeof NIVELES_MOROSIDAD

export function nivelMorosidad(diasAtraso: number): NivelMorosidad {
  if (diasAtraso <= 0) return 'al_corriente'
  if (diasAtraso < 8) return 'atraso'
  if (diasAtraso < 30) return 'moroso'
  return 'cartera_vencida'
}

// RF72: el Gerente corrige (revierte) un pago mal registrado, con motivo
export const esquemaCorreccion = z.object({ motivo, claveIdempotencia })

/**
 * Deshace el reparto de un pago (RF72). Como los pagos se aplican de lo más antiguo a lo más reciente,
 * revertir el último pago es quitar el monto de lo más reciente hacia atrás: así se devuelven
 * exactamente las semanas y moras que ese pago cubrió.
 */
export function revertirReparto<T extends { semana: number }>(filas: T[], cubierto: (f: T) => number, montoCentavos: number) {
  let resto = montoCentavos
  const cambios: { semana: number, valor: number }[] = []
  for (const f of [...filas].sort((a, b) => b.semana - a.semana)) {
    if (resto === 0) break
    const quita = Math.min(cubierto(f), resto)
    if (quita === 0) continue
    resto -= quita
    cambios.push({ semana: f.semana, valor: cubierto(f) - quita })
  }
  return { cambios, faltante: resto } // faltante > 0 indicaría datos inconsistentes
}

// RF17–RF23: documentos. Fotos del celular o PDF de hasta 10 MB.
export const TIPOS_ARCHIVO_DOCUMENTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024

export const NOMBRE_TIPO_DOCUMENTO = {
  identificacion: 'Identificación',
  comprobante_domicilio: 'Comprobante de domicilio',
  solicitud_firmada: 'Solicitud firmada',
  contrato_firmado: 'Contrato firmado',
  evidencia_desembolso: 'Evidencia del desembolso',
  comprobante_liquidacion: 'Comprobante de liquidación firmado',
  otro: 'Otro',
} as const

// Datos del documento (en la URL); el archivo va en el cuerpo de la petición, tal cual
export const esquemaSubirDocumento = z.object({
  tipo: z.enum(Object.keys(NOMBRE_TIPO_DOCUMENTO) as [keyof typeof NOMBRE_TIPO_DOCUMENTO], { error: 'Elige el tipo de documento' }),
  nombre: z.string().trim().min(1).max(200),
  solicitudId: z.uuid().optional(),
  creditoId: z.uuid().optional(),
})

/**
 * RF73, RF74: situación de cobro de un crédito vigente calculada solo con sus datos, sin leer el
 * calendario. Es posible porque las semanas siempre se cubren en orden: los pagos van de la más antigua
 * en adelante y las correcciones revierten de la más reciente hacia atrás. Así, con lo pagado se sabe
 * cuántas semanas están completas, y los vencimientos son la fecha de desembolso más 7 días por semana.
 */
export function situacionDelCredito(
  c: { totalCentavos: number, saldoCentavos: number, pagoSemanalCentavos: number, plazoSemanas: number, fechaDesembolso: string },
  hoy: string,
) {
  const { totalCentavos: total, pagoSemanalCentavos: pago, plazoSemanas: plazo } = c
  const pagado = total - c.saldoCentavos
  // Lo que suman las primeras n semanas (la última lleva la diferencia del redondeo)
  const acumulado = (n: number) => (n <= 0 ? 0 : n >= plazo ? total : n * pago)
  const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${c.fechaDesembolso}T00:00:00Z`)) / 86_400_000)
  const limitar = (n: number) => Math.min(plazo, Math.max(0, n))
  const vencenAntesDeHoy = limitar(Math.ceil(dias / 7) - 1) // semana s vence el día 7·s
  const vencenHastaHoy = limitar(Math.floor(dias / 7))
  const completas = pagado >= total ? plazo : pago > 0 ? Math.min(plazo - 1, Math.floor(pagado / pago)) : 0
  const vencidoCentavos = Math.max(0, acumulado(vencenAntesDeHoy) - pagado)
  return {
    semanasCompletas: completas,
    semanasVencidas: Math.max(0, vencenAntesDeHoy - completas), // las semanas completas + 1 … vencenAntesDeHoy
    vencidoCentavos,
    venceHoyCentavos: Math.max(0, acumulado(vencenHastaHoy) - pagado) - vencidoCentavos,
    proximoVencimiento: completas < plazo ? sumarDias(c.fechaDesembolso, 7 * (completas + 1)) : null,
  }
}
