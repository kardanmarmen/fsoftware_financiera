/**
 * Descarga una tabla como archivo CSV que Excel abre con acentos (BOM UTF-8).
 * Los montos se pasan ya como texto o número; las celdas con comas o comillas se escapan.
 */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    const t = v == null ? '' : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

/** Centavos como número con dos decimales para Excel: 37500 → "375.00" */
export const pesosCsv = (centavos: number | null | undefined) => (centavos == null ? '' : (centavos / 100).toFixed(2))
