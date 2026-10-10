import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
// Ruta relativa (no alias) para que drizzle-kit también pueda leer este archivo.
import { ROLES } from '../../shared/utils/usuarios'

// Convenciones (ver docs/incremento-1/1.2-diseno-usuarios-roles.md):
// - ids: UUID generado en la aplicación
// - fechas: milisegundos desde 1970 (UTC)
// - sí/no: 0 o 1 (en TypeScript se leen como boolean)

export const usuarios = sqliteTable(
  'usuarios',
  {
    id: text('id').primaryKey(),
    usuario: text('usuario').notNull().unique(), // siempre en minúsculas (RN-01)
    nombre: text('nombre').notNull(),
    rol: text('rol', { enum: ROLES }).notNull(),
    gerenteId: text('gerente_id'),
    contrasenaHash: text('contrasena_hash').notNull(),
    contrasenaTemporal: integer('contrasena_temporal', { mode: 'boolean' }).notNull().default(false),
    temporalExpiraEn: integer('temporal_expira_en'),
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoPor: text('creado_por'),
    creadoEn: integer('creado_en').notNull(),
    actualizadoEn: integer('actualizado_en').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.gerenteId], foreignColumns: [t.id] }),
    foreignKey({ columns: [t.creadoPor], foreignColumns: [t.id] }),
    index('idx_usuarios_gerente').on(t.gerenteId),
    check('rol_valido', sql`${t.rol} IN ('administrador', 'gerente', 'cobrador')`),
    check('contrasena_temporal_valida', sql`${t.contrasenaTemporal} IN (0, 1)`),
    check('activo_valido', sql`${t.activo} IN (0, 1)`),
    // RN-02: solo el Cobrador tiene Gerente
    check(
      'gerente_solo_cobrador',
      sql`(${t.rol} = 'cobrador' AND ${t.gerenteId} IS NOT NULL) OR (${t.rol} <> 'cobrador' AND ${t.gerenteId} IS NULL)`,
    ),
  ],
)

export const MOTIVOS_CIERRE = [
  'salida', // el usuario cerró sesión
  'nuevo_inicio', // inició sesión en otro dispositivo (RF05)
  'domingo', // cierre semanal (RF06)
  'inactividad', // 3 días sin actividad (RF07)
  'desactivado', // su cuenta fue desactivada (RF04)
  'restablecimiento', // el Administrador restableció su contraseña (RF08)
  'cambio_contrasena',
] as const
export type MotivoCierre = (typeof MOTIVOS_CIERRE)[number]

export const sesiones = sqliteTable(
  'sesiones',
  {
    id: text('id').primaryKey(),
    usuarioId: text('usuario_id').notNull().references(() => usuarios.id),
    creadaEn: integer('creada_en').notNull(),
    ultimaActividadEn: integer('ultima_actividad_en').notNull(),
    cerradaEn: integer('cerrada_en'),
    motivoCierre: text('motivo_cierre', { enum: MOTIVOS_CIERRE }),
    dispositivo: text('dispositivo'),
    ip: text('ip'),
  },
  (t) => [
    // RF05 / RN-16: la base de datos impide dos sesiones abiertas de la misma cuenta.
    uniqueIndex('idx_sesiones_una_abierta').on(t.usuarioId).where(sql`${t.cerradaEn} IS NULL`),
    check(
      'motivo_cierre_valido',
      sql`${t.motivoCierre} IN ('salida', 'nuevo_inicio', 'domingo', 'inactividad', 'desactivado', 'restablecimiento', 'cambio_contrasena')`,
    ),
  ],
)

export const bitacora = sqliteTable(
  'bitacora',
  {
    id: text('id').primaryKey(),
    usuarioId: text('usuario_id').references(() => usuarios.id), // NULL si el usuario no existe
    gerenteId: text('gerente_id'), // Gerente del usuario al momento del evento
    usuarioIntentado: text('usuario_intentado'), // solo en intentos fallidos
    accion: text('accion').notNull(),
    entidad: text('entidad'),
    entidadId: text('entidad_id'),
    detalle: text('detalle'), // JSON
    ip: text('ip'),
    creadoEn: integer('creado_en').notNull(),
  },
  (t) => [
    index('idx_bitacora_fecha').on(t.creadoEn),
    index('idx_bitacora_usuario').on(t.usuarioId, t.creadoEn),
    index('idx_bitacora_gerente').on(t.gerenteId, t.creadoEn),
  ],
)

export type Usuario = typeof usuarios.$inferSelect
export type Sesion = typeof sesiones.$inferSelect
