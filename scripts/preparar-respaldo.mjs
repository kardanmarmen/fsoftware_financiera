// Prepara un respaldo de D1 para restaurarlo (RF119). Ver docs/incremento-2/2.7-respaldo-de-datos.md
//
// La exportación de D1 escribe cada tabla seguida de sus datos, en orden alfabético. Al restaurar,
// los datos de una tabla (por ejemplo bitacora) llegan antes que los de la tabla a la que apuntan
// (usuarios), y la importación falla ("no such table" o "D1_RESET_DO"). Este script reacomoda el
// archivo, sin cambiar ningún dato:
//   1. Todos los CREATE TABLE al inicio.
//   2. Los datos de cada tabla después de los de las tablas a las que apunta (según sus FOREIGN KEY).
//   3. Los índices al final.
// También quita las líneas de la tabla interna sqlite_sequence, que D1 no permite modificar.
//
// Uso: node scripts/preparar-respaldo.mjs respaldo.sql respaldo-listo.sql
import { readFileSync, writeFileSync } from 'node:fs'

const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida) {
  console.error('Uso: node scripts/preparar-respaldo.mjs <respaldo.sql> <respaldo-listo.sql>')
  process.exit(1)
}

const lineas = readFileSync(entrada, 'utf8').split('\n')
const pragmas = []
const tablas = new Map() // nombre → CREATE TABLE completo
const datos = new Map() // nombre → INSERT de esa tabla, en su orden original
const indices = []
let ultimo = null // sentencia a la que se agregan las líneas que continúan (textos con saltos de línea)

const nombreTabla = (texto) => texto.match(/^(?:CREATE TABLE (?:IF NOT EXISTS )?|INSERT INTO )["`]?([^"`\s(]+)/)?.[1]

for (let i = 0; i < lineas.length; i++) {
  const linea = lineas[i]
  if (/^CREATE TABLE /.test(linea)) {
    // Un CREATE TABLE de varias líneas termina en la primera línea que es exactamente ");"
    const bloque = [linea]
    if (!linea.trimEnd().endsWith(');')) {
      while (i + 1 < lineas.length && lineas[i].trimEnd() !== ');') bloque.push(lineas[++i])
    }
    tablas.set(nombreTabla(linea), bloque.join('\n'))
    ultimo = null
  } else if (/^INSERT INTO "sqlite_sequence"|^DELETE FROM sqlite_sequence/.test(linea)) {
    ultimo = null // tabla interna: SQLite la vuelve a llenar sola
  } else if (/^INSERT INTO /.test(linea)) {
    const tabla = nombreTabla(linea)
    if (!datos.has(tabla)) datos.set(tabla, [])
    ultimo = [linea]
    datos.get(tabla).push(ultimo)
  } else if (/^CREATE (UNIQUE )?INDEX /.test(linea)) {
    indices.push(linea)
    ultimo = null
  } else if (/^PRAGMA /.test(linea)) {
    pragmas.push(linea)
  } else if (ultimo) {
    ultimo.push(linea) // continuación de un texto con salto de línea
  }
}

// Orden de las tablas: primero aquellas a las que otras apuntan. Si hay un ciclo (por ejemplo
// solicitudes ↔ creditos), se ignoran las referencias de columnas que aceptan NULL.
function referencias(nombre, soloObligatorias) {
  const sql = tablas.get(nombre)
  return [...sql.matchAll(/FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`/g)]
    .filter(([, columna, destino]) => destino !== nombre && tablas.has(destino))
    .filter(([, columna]) => !soloObligatorias || new RegExp(`\`${columna}\`[^,\\n]*NOT NULL`).test(sql))
    .map(([, , destino]) => destino)
}
const orden = []
const pendientes = new Set(tablas.keys())
while (pendientes.size) {
  const listas = [...pendientes].filter((t) => referencias(t, false).every((d) => !pendientes.has(d)))
  const siguiente = listas.length ? listas
    : [...pendientes].filter((t) => referencias(t, true).every((d) => !pendientes.has(d)))
  const lote = siguiente.length ? siguiente : [...pendientes] // último recurso: orden original
  for (const t of lote) { orden.push(t); pendientes.delete(t) }
}

const resultado = [
  ...pragmas,
  ...[...tablas.values()],
  ...orden.flatMap((t) => (datos.get(t) ?? []).map((sentencia) => sentencia.join('\n'))),
  ...indices,
]
writeFileSync(salida, resultado.join('\n') + '\n')

const filas = [...datos.values()].reduce((n, l) => n + l.length, 0)
console.log(`Listo: ${tablas.size} tablas, ${filas} filas, ${indices.length} índices → ${salida}`)
console.log(`Orden de los datos: ${orden.join(', ')}`)
