# Financiera

Aplicación web para la administración interna de una financiera: clientes, solicitudes, créditos,
pagos, moras, renovaciones y liquidaciones, con roles de Administrador, Gerente y Cobrador.

Proyecto escolar de **Fundamentos de Ingeniería de Software** (ITS Misantla), desarrollado con
metodología incremental.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Aplicación (páginas y API) | [Nuxt 4](https://nuxt.com) con Vue 3 y TypeScript |
| Interfaz | [Nuxt UI](https://ui.nuxt.com) |
| Validación | [Zod](https://zod.dev) (las mismas reglas en formularios y API) |
| Base de datos | Cloudflare D1 (SQLite) con [Drizzle ORM](https://orm.drizzle.team) |
| Sesiones y contraseñas | [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) (cookie cifrada, contraseñas con scrypt) |
| Publicación | Cloudflare Workers |

## Avance

| Incremento | Estado |
| --- | --- |
| 1. Usuarios, roles y seguridad | ✅ Terminado (1.1 a 1.5) |
| 2. Base de datos y clientes | ✅ Terminado (2.1 a 2.8) |
| 3. Solicitudes y aprobación de créditos | ✅ Terminado (3.1 a 3.6) |
| 4. Pagos, abonos y morosidad | ✅ Terminado (4.1 a 4.7) |
| 5. Renovaciones y liquidaciones | ✅ Terminado (5.1 a 5.6) |
| 6. Integración, pruebas e implementación | 🟡 Integración, pruebas, rendimiento y manual listos; falta publicar en producción ([6.6](docs/incremento-6/6.6-implementacion-en-produccion.md)) |

Documentación de cada incremento en [`docs/`](docs/):

| Incremento | Diseño | Pruebas |
| --- | --- | --- |
| 1 | [1.1 Análisis](docs/incremento-1/1.1-analisis-requisitos-acceso.md), [1.2 Diseño](docs/incremento-1/1.2-diseno-usuarios-roles.md) | — |
| 2 | [2.1 Base de datos](docs/incremento-2/2.1-diseno-base-de-datos.md), [2.7 Respaldos](docs/incremento-2/2.7-respaldo-de-datos.md) | [2.8](docs/incremento-2/2.8-pruebas-del-modulo.md) |
| 3 | [3.1 Solicitudes y aprobación](docs/incremento-3/3.1-solicitudes-y-aprobacion.md) | [3.6](docs/incremento-3/3.6-pruebas-del-modulo.md) |
| 4 | [4.1 Pagos y morosidad](docs/incremento-4/4.1-pagos-y-morosidad.md) | [4.7](docs/incremento-4/4.7-pruebas-del-modulo.md) |
| 5 | [5.1 Liquidaciones y renovaciones](docs/incremento-5/5.1-liquidaciones-y-renovaciones.md) | [5.6](docs/incremento-5/5.6-pruebas-del-modulo.md) |
| 6 | [6.4 Manual de usuario](docs/incremento-6/6.4-manual-de-usuario.md), [6.6 Implementación en producción](docs/incremento-6/6.6-implementacion-en-produccion.md) | [6.1 Funcionales](docs/incremento-6/6.1-integracion-y-pruebas-funcionales.md), [6.3 Rendimiento](docs/incremento-6/6.3-pruebas-de-rendimiento.md) |

Las pruebas automáticas están en [`pruebas/`](pruebas/README.md).

## Desarrollo local

Requisitos: Node.js 24 (versión en `.node-version`). No hace falta cuenta de Cloudflare: la base
de datos D1 se simula en la carpeta `.wrangler/`.

Crea el archivo `.env` con dos claves aleatorias (no se suben a git):

```sh
node -e "for (const n of ['NUXT_SESSION_PASSWORD', 'NUXT_PASSWORD_PEPPER']) console.log(n + '=' + require('crypto').randomBytes(32).toString('base64url'))" > .env
```

- `NUXT_SESSION_PASSWORD`: cifra la cookie de sesión.
- `NUXT_PASSWORD_PEPPER`: clave secreta que se mezcla con las contraseñas antes del hash. En producción
  es un secreto de Cloudflare distinto. **Si se pierde, ninguna contraseña con pepper vuelve a funcionar**
  (se recupera el acceso con `restablecer-admin`, que crea contraseñas temporales sin pepper).

```sh
npm install
npm run db:migrar:local                                   # crea las tablas en la base local
npm run crear-admin -- admin "Administrador General"      # muestra una contraseña temporal
npm run dev                                               # http://localhost:3000
```

Entra con `admin` y la contraseña temporal; el sistema pedirá cambiarla.

## Administradores (scripts)

Desde el sistema no se crean Administradores ni se restablece su contraseña, así que se hace con
estos scripts. Cada uno muestra una contraseña temporal de 24 horas; al entrar, el sistema pide
cambiarla.

**Crear un Administrador:**

```sh
npm run crear-admin -- admin2 "Nombre Completo"            # base local
npm run crear-admin -- admin2 "Nombre Completo" --remoto   # base en Cloudflare (requiere wrangler login)
npm run crear-admin -- admin2 "Nombre Completo" --sql      # solo imprime el SQL
```

**Restablecer la contraseña de un Administrador que la olvidó:**

```sh
npm run restablecer-admin -- admin2             # base local
npm run restablecer-admin -- admin2 --remoto    # base en Cloudflare (requiere wrangler login)
npm run restablecer-admin -- admin2 --sql       # solo imprime el SQL
```

El nombre va entre comillas si tiene espacios.

**Modo `--sql` (sin wrangler):** el script no se conecta a nada; calcula el hash de la contraseña e
imprime el SQL. Solo necesita Node.js y el proyecto con `npm install`. Para aplicarlo:

1. En el panel de Cloudflare: **D1 SQL Database → financiera → Explore Data → Query**.
2. Pega el SQL completo (entre las líneas punteadas) y presiona **Run**. El de restablecer tiene
   3 sentencias: si solo se ejecuta una, usa la flecha junto a **Run** para ejecutar todas.
3. Si al crear sale un error de `UNIQUE`, ese usuario ya existe. Si al restablecer no se modifica
   ninguna fila, ese Administrador no existe.

El SQL impreso contiene el hash de la contraseña: no lo guardes ni lo compartas.

> La primera vez, `npm install` puede avisar que algunos paquetes (`esbuild`, `workerd`, `vue-demi`)
> tienen scripts de instalación. Ya están aprobados en `package.json` (`allowScripts`).

## Cambios en la base de datos

1. Modifica `server/db/esquema.ts`.
2. `npm run db:generar` crea el archivo `.sql` de la migración en `server/db/migraciones/`.
3. `npm run db:migrar:local` lo aplica en la base local.
4. Haz commit del esquema y de la migración juntos.

Nunca edites una migración que ya se aplicó: crea una nueva.

## Respaldos

Cada domingo a las 03:30 (hora del centro de México) el Worker `financiera-respaldos` exporta la base
de datos completa a R2 y la conserva 12 semanas. El Administrador ve el resultado en **Respaldos**.

- Configuración, recuperación y cómo probarlo: [docs/incremento-2/2.7-respaldo-de-datos.md](docs/incremento-2/2.7-respaldo-de-datos.md).
- Publicar un cambio en el Worker de respaldos (no se publica solo con la aplicación):
  ```sh
  cd respaldos
  npx wrangler deploy
  ```
- Antes de restaurar una exportación hay que reacomodarla con
  `node scripts/preparar-respaldo.mjs respaldo.sql respaldo-listo.sql` (el documento 2.7 explica por qué).

## Estructura

```
app/                 Interfaz (Vue)
  pages/             Una página por ruta (/usuarios, /bitacora, ...)
  layouts/           Encabezado y menú según el rol
  middleware/        Protección de páginas (sesión, contraseña temporal, rol)
  components/        Componentes reutilizables
server/              API y acceso a datos
  api/               Una ruta por archivo (usuarios/index.post.ts = POST /api/usuarios)
  db/esquema.ts      Tablas de la base de datos (Drizzle)
  db/migraciones/    Archivos .sql generados
  utils/             Permisos, bitácora, conexión a la base, validación
shared/              Código que usan las páginas y la API (roles, validaciones Zod, formato)
scripts/             crear-admin.mjs, restablecer-admin.mjs, preparar-respaldo.mjs
respaldos/           Worker aparte con el respaldo semanal (Workflow + Cron Trigger)
pruebas/             Pruebas automáticas de la API, de pantalla y de rendimiento
docs/                Análisis, diseño y pruebas por incremento
```
