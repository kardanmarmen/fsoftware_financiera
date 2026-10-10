// Restablece la contraseña de un Administrador que la olvidó. Desde el sistema no se puede:
// solo un Administrador restablece contraseñas, y no la de otro Administrador (RF08).
// Genera una contraseña temporal de 24 horas, cierra su sesión y lo registra en la bitácora.
//
// Uso:
//   npm run restablecer-admin -- <usuario>            (base local)
//   npm run restablecer-admin -- <usuario> --remoto   (base en Cloudflare)
import { randomUUID } from 'node:crypto'
import {
  USUARIO_VALIDO, VIGENCIA_TEMPORAL_MS, consultarSql, ejecutarSql, generarContrasenaTemporal, hashear, leerArgumentos, texto,
} from './comun.mjs'

const { usuario, remoto } = leerArgumentos()
if (!USUARIO_VALIDO.test(usuario)) {
  console.error('Uso: npm run restablecer-admin -- <usuario> [--remoto]')
  process.exit(1)
}

const encontrados = consultarSql(
  `SELECT id FROM usuarios WHERE usuario = ${texto(usuario)} AND rol = 'administrador'`,
  remoto,
)
if (encontrados.length === 0) {
  console.error(`No existe un Administrador con el usuario "${usuario}" en la base ${remoto ? 'de Cloudflare' : 'local'}.`)
  process.exit(1)
}
const id = texto(encontrados[0].id)

const temporal = generarContrasenaTemporal()
const ahora = Date.now()

// Las tres sentencias van en un solo archivo: D1 las ejecuta como una sola transacción.
ejecutarSql(`
UPDATE usuarios
SET contrasena_hash = ${texto(await hashear(temporal))}, contrasena_temporal = 1,
    temporal_expira_en = ${ahora + VIGENCIA_TEMPORAL_MS}, actualizado_en = ${ahora}
WHERE id = ${id};

UPDATE sesiones SET cerrada_en = ${ahora}, motivo_cierre = 'restablecimiento'
WHERE usuario_id = ${id} AND cerrada_en IS NULL;

INSERT INTO bitacora (id, usuario_id, accion, entidad, entidad_id, detalle, creado_en)
VALUES (${texto(randomUUID())}, NULL, 'contrasena_restablecida', 'usuario', ${id}, '{"origen":"script"}', ${ahora});
`, remoto)

console.log(`Contraseña de "${usuario}" restablecida en la base ${remoto ? 'de Cloudflare' : 'local'}.`)
console.log(`Contraseña temporal: ${temporal}`)
console.log('Vence en 24 horas. Al entrar, el sistema pedirá elegir una contraseña nueva.')
