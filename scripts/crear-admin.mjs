// Crea un Administrador con una contraseña temporal (vence en 24 horas).
//
// Uso:
//   npm run crear-admin -- <usuario> "<Nombre completo>"            (base local)
//   npm run crear-admin -- <usuario> "<Nombre completo>" --remoto   (base en Cloudflare)
import { randomUUID } from 'node:crypto'
import {
  USUARIO_VALIDO, VIGENCIA_TEMPORAL_MS, ejecutarSql, generarContrasenaTemporal, hashear, leerArgumentos, texto,
} from './comun.mjs'

const { usuario, nombre, remoto } = leerArgumentos()
if (!USUARIO_VALIDO.test(usuario) || !nombre) {
  console.error('Uso: npm run crear-admin -- <usuario> "<Nombre completo>" [--remoto]')
  console.error('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.')
  process.exit(1)
}

const temporal = generarContrasenaTemporal()
const ahora = Date.now()

try {
  ejecutarSql(`INSERT INTO usuarios
  (id, usuario, nombre, rol, gerente_id, contrasena_hash, contrasena_temporal, temporal_expira_en, activo, creado_por, creado_en, actualizado_en)
VALUES
  (${texto(randomUUID())}, ${texto(usuario)}, ${texto(nombre)}, 'administrador', NULL, ${texto(await hashear(temporal))}, 1, ${ahora + VIGENCIA_TEMPORAL_MS}, 1, NULL, ${ahora}, ${ahora});`, remoto)
} catch {
  console.error(`\nNo se pudo crear el Administrador. ¿Ya existe el usuario "${usuario}"?`)
  process.exit(1)
}

console.log(`Administrador "${usuario}" creado en la base ${remoto ? 'de Cloudflare' : 'local'}.`)
console.log(`Contraseña temporal: ${temporal}`)
console.log('Vence en 24 horas. Al entrar, el sistema pedirá elegir una contraseña nueva.')
