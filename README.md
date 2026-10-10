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
| 1. Usuarios, roles y seguridad | En desarrollo: 1.1 ✅ 1.2 ✅ 1.3 ✅ 1.4 ✅ 1.5 ⏳ |
| 2. Base de datos y clientes | Pendiente |
| 3. Solicitudes y aprobación de créditos | Pendiente |
| 4. Pagos, abonos y morosidad | Pendiente |
| 5. Renovaciones y liquidaciones | Pendiente |
| 6. Integración, pruebas e implementación | Pendiente |

Documentación de cada incremento en [`docs/`](docs/).

## Desarrollo local

Requisitos: Node.js 24 (versión en `.node-version`). No hace falta cuenta de Cloudflare: la base
de datos D1 se simula en la carpeta `.wrangler/`.

```sh
npm install
npm run db:migrar:local                                   # crea las tablas en la base local
npm run crear-admin -- admin "Administrador General"      # muestra una contraseña temporal
npm run dev                                               # http://localhost:3000
```

Entra con `admin` y la contraseña temporal; el sistema pedirá cambiarla.

> La primera vez, `npm install` puede avisar que algunos paquetes (`esbuild`, `workerd`, `vue-demi`)
> tienen scripts de instalación. Ya están aprobados en `package.json` (`allowScripts`).

## Cambios en la base de datos

1. Modifica `server/db/esquema.ts`.
2. `npm run db:generar` crea el archivo `.sql` de la migración en `server/db/migraciones/`.
3. `npm run db:migrar:local` lo aplica en la base local.
4. Haz commit del esquema y de la migración juntos.

Nunca edites una migración que ya se aplicó: crea una nueva.

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
scripts/             crear-admin.mjs
docs/                Análisis y diseño por incremento
```
