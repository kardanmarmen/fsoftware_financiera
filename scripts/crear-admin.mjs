// Crea un Administrador con una contraseña temporal (vence en 24 horas).
//
// Uso:
//   npm run crear-admin -- <usuario> "<Nombre completo>"            (base local)
//   npm run crear-admin -- <usuario> "<Nombre completo>" --remoto   (base en Cloudflare, con wrangler)
//   npm run crear-admin -- <usuario> "<Nombre completo>" --sql      (solo imprime el SQL para el panel de Cloudflare)
import { randomUUID } from 'node:crypto'
import {
  USUARIO_VALIDO, VIGENCIA_TEMPORAL_MS, consultarSql, ejecutarSql, generarContrasenaTemporal, hashear,
  imprimirSql, leerArgumentos, texto,
} from './comun.mjs'

const { usuario, nombre, remoto, soloSql } = leerArgumentos()
if (!USUARIO_VALIDO.test(usuario) || !nombre) {
  console.error('Uso: npm run crear-admin -- <usuario> "<Nombre completo>" [--remoto | --sql]')
  console.error('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.')
  process.exit(1)
}

// Con wrangler se comprueba antes; en modo --sql, si ya existe, la consola marca error de UNIQUE.
if (!soloSql && consultarSql(`SELECT id FROM usuarios WHERE usuario = ${texto(usuario)}`, remoto).length > 0) {
  console.error(`Ya existe el usuario "${usuario}". Si es un Administrador que olvidó su contraseña, usa:`)
  console.error(`  npm run restablecer-admin -- ${usuario}${remoto ? ' --remoto' : ''}`)
  process.exit(1)
}

const temporal = generarContrasenaTemporal()
const ahora = Date.now()

const sql = `
INSERT INTO usuarios
  (id, usuario, nombre, rol, gerente_id, contrasena_hash, contrasena_temporal, temporal_expira_en, activo, creado_por, creado_en, actualizado_en)
VALUES
  (${texto(randomUUID())}, ${texto(usuario)}, ${texto(nombre)}, 'administrador', NULL, ${texto(await hashear(temporal))}, 1, ${ahora + VIGENCIA_TEMPORAL_MS}, 1, NULL, ${ahora}, ${ahora});
`

if (soloSql) {
  imprimirSql(sql, temporal)
} else {
  ejecutarSql(sql, remoto)
  console.log(`Administrador "${usuario}" creado en la base ${remoto ? 'de Cloudflare' : 'local'}.`)
  console.log(`Contraseña temporal: ${temporal}`)
  console.log('Vence en 24 horas. Al entrar, el sistema pedirá elegir una contraseña nueva.')
}
