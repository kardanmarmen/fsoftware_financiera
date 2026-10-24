import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
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

// ---------------------------------------------------------------------------------------------
// Incremento 2 (ver docs/incremento-2/2.1-diseno-base-de-datos.md)
// - dinero: centavos (_centavos), para que las sumas sean exactas
// - porcentajes: centésimas de punto (_bp): 20 % = 2000
// - fechas sin hora: texto AAAA-MM-DD
// ---------------------------------------------------------------------------------------------

export const clientes = sqliteTable(
  'clientes',
  {
    id: text('id').primaryKey(),
    curp: text('curp').notNull().unique(), // en mayúsculas (RN-20)
    nombre: text('nombre').notNull(),
    apellidoPaterno: text('apellido_paterno').notNull(),
    apellidoMaterno: text('apellido_materno'), // hay personas con un solo apellido
    nombreBusqueda: text('nombre_busqueda').notNull(), // "perez lopez maria", sin acentos
    fechaNacimiento: text('fecha_nacimiento').notNull(), // se toma de la CURP (RN-21)
    telefono: text('telefono').notNull(),
    telefonoAlterno: text('telefono_alterno'),
    correo: text('correo'),
    calle: text('calle').notNull(),
    numeroExterior: text('numero_exterior').notNull(),
    numeroInterior: text('numero_interior'),
    colonia: text('colonia').notNull(),
    municipio: text('municipio').notNull(),
    estado: text('estado').notNull(),
    codigoPostal: text('codigo_postal').notNull(),
    referenciasDomicilio: text('referencias_domicilio'), // entre calles, color de la casa…
    notas: text('notas'),
    cobradorId: text('cobrador_id').notNull().references(() => usuarios.id), // RF15
    creadoPor: text('creado_por').notNull().references(() => usuarios.id),
    creadoEn: integer('creado_en').notNull(),
    actualizadoEn: integer('actualizado_en').notNull(),
  },
  (t) => [
    index('idx_clientes_cobrador').on(t.cobradorId),
    index('idx_clientes_nombre').on(t.nombreBusqueda),
    index('idx_clientes_telefono').on(t.telefono),
    check('curp_longitud', sql`LENGTH(${t.curp}) = 18`),
    check('codigo_postal_longitud', sql`LENGTH(${t.codigoPostal}) = 5`),
  ],
)

export const TIPOS_MODELO = ['interes_fijo'] as const // RF40: se agregarán más

export const modelosCredito = sqliteTable(
  'modelos_credito',
  {
    id: text('id').primaryKey(),
    nombre: text('nombre').notNull().unique(),
    tipo: text('tipo', { enum: TIPOS_MODELO }).notNull(),
    tasaInteresBp: integer('tasa_interes_bp').notNull(), // RF37
    plazoSemanas: integer('plazo_semanas').notNull(), // RF36: 16
    moraSemanalCentavos: integer('mora_semanal_centavos').notNull(),
    semanasParaRenovar: integer('semanas_para_renovar').notNull(), // RF83: 4
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoPor: text('creado_por').notNull().references(() => usuarios.id),
    creadoEn: integer('creado_en').notNull(),
    actualizadoEn: integer('actualizado_en').notNull(),
  },
  (t) => [
    check('tipo_modelo_valido', sql`${t.tipo} IN ('interes_fijo')`),
    check('tasa_no_negativa', sql`${t.tasaInteresBp} >= 0`),
    check('plazo_modelo_positivo', sql`${t.plazoSemanas} > 0`),
    check('mora_modelo_no_negativa', sql`${t.moraSemanalCentavos} >= 0`),
    check('semanas_renovar_no_negativas', sql`${t.semanasParaRenovar} >= 0`),
    check('modelo_activo_valido', sql`${t.activo} IN (0, 1)`),
  ],
)

// RF27: modelos que puede usar cada Cobrador
export const cobradorModelos = sqliteTable(
  'cobrador_modelos',
  {
    cobradorId: text('cobrador_id').notNull().references(() => usuarios.id),
    modeloId: text('modelo_id').notNull().references(() => modelosCredito.id),
    asignadoPor: text('asignado_por').notNull().references(() => usuarios.id),
    asignadoEn: integer('asignado_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cobradorId, t.modeloId] })],
)

export const TIPOS_SOLICITUD = ['nueva', 'renovacion'] as const
export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'cancelada'] as const

export const solicitudes = sqliteTable(
  'solicitudes',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull().references(() => clientes.id),
    cobradorId: text('cobrador_id').notNull().references(() => usuarios.id),
    modeloId: text('modelo_id').notNull().references(() => modelosCredito.id),
    tipo: text('tipo', { enum: TIPOS_SOLICITUD }).notNull(),
    creditoAnteriorId: text('credito_anterior_id').references((): AnySQLiteColumn => creditos.id), // renovaciones
    montoSolicitadoCentavos: integer('monto_solicitado_centavos').notNull(),
    ocupacion: text('ocupacion'), // información laboral
    ingresoSemanalCentavos: integer('ingreso_semanal_centavos'),
    // Se copian del modelo (RF42) y el Gerente las puede ajustar antes de aprobar (RF47, RF48)
    tasaInteresBp: integer('tasa_interes_bp').notNull(),
    plazoSemanas: integer('plazo_semanas').notNull(),
    moraSemanalCentavos: integer('mora_semanal_centavos').notNull(),
    estado: text('estado', { enum: ESTADOS_SOLICITUD }).notNull().default('pendiente'),
    montoAprobadoCentavos: integer('monto_aprobado_centavos'),
    fechaDesembolso: text('fecha_desembolso'), // RF52
    motivo: text('motivo'), // de rechazo (RF51) o cancelación (RF54)
    revisadaPor: text('revisada_por').references(() => usuarios.id),
    revisadaEn: integer('revisada_en'),
    creadoPor: text('creado_por').notNull().references(() => usuarios.id),
    creadoEn: integer('creado_en').notNull(),
    actualizadoEn: integer('actualizado_en').notNull(),
  },
  (t) => [
    index('idx_solicitudes_cliente').on(t.clienteId, t.creadoEn),
    index('idx_solicitudes_cobrador').on(t.cobradorId, t.estado),
    check('tipo_solicitud_valido', sql`${t.tipo} IN ('nueva', 'renovacion')`),
    check('estado_solicitud_valido', sql`${t.estado} IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')`),
    check('monto_solicitado_positivo', sql`${t.montoSolicitadoCentavos} > 0`),
    check('plazo_solicitud_positivo', sql`${t.plazoSemanas} > 0`),
    check('renovacion_con_credito_anterior', sql`(${t.tipo} = 'renovacion') = (${t.creditoAnteriorId} IS NOT NULL)`),
    check('motivo_al_rechazar', sql`${t.estado} NOT IN ('rechazada', 'cancelada') OR ${t.motivo} IS NOT NULL`), // RF51
    check(
      'aprobada_con_monto_y_fecha',
      sql`${t.estado} <> 'aprobada' OR (${t.montoAprobadoCentavos} > 0 AND ${t.fechaDesembolso} IS NOT NULL)`,
    ),
  ],
)

export const ESTADOS_CREDITO = ['aprobado', 'aceptado', 'liquidado', 'cancelado'] as const // RF57
export const TIPOS_LIQUIDACION = ['normal', 'anticipada'] as const

export const creditos = sqliteTable(
  'creditos',
  {
    id: text('id').primaryKey(),
    folio: text('folio').notNull().unique(), // CR-000001
    solicitudId: text('solicitud_id').notNull().unique().references(() => solicitudes.id), // RF56
    clienteId: text('cliente_id').notNull().references(() => clientes.id),
    cobradorId: text('cobrador_id').notNull().references(() => usuarios.id), // responsable actual
    modeloId: text('modelo_id').notNull().references(() => modelosCredito.id),
    // RF55, RF58: condiciones con las que se aceptó; no cambian después del desembolso
    montoCentavos: integer('monto_centavos').notNull(), // lo que recibe el cliente
    tasaInteresBp: integer('tasa_interes_bp').notNull(),
    plazoSemanas: integer('plazo_semanas').notNull(),
    moraSemanalCentavos: integer('mora_semanal_centavos').notNull(),
    interesCentavos: integer('interes_centavos').notNull(),
    totalCentavos: integer('total_centavos').notNull(), // monto + interés
    pagoSemanalCentavos: integer('pago_semanal_centavos').notNull(),
    saldoCentavos: integer('saldo_centavos').notNull(), // RF59
    estado: text('estado', { enum: ESTADOS_CREDITO }).notNull().default('aprobado'),
    fechaDesembolso: text('fecha_desembolso').notNull(),
    aceptadoEn: integer('aceptado_en'), // RF94
    liquidadoEn: integer('liquidado_en'),
    tipoLiquidacion: text('tipo_liquidacion', { enum: TIPOS_LIQUIDACION }),
    creadoEn: integer('creado_en').notNull(),
    actualizadoEn: integer('actualizado_en').notNull(),
  },
  (t) => [
    index('idx_creditos_cliente').on(t.clienteId, t.estado),
    index('idx_creditos_cobrador').on(t.cobradorId, t.estado),
    check('estado_credito_valido', sql`${t.estado} IN ('aprobado', 'aceptado', 'liquidado', 'cancelado')`),
    check('tipo_liquidacion_valido', sql`${t.tipoLiquidacion} IN ('normal', 'anticipada')`),
    check('monto_credito_positivo', sql`${t.montoCentavos} > 0`),
    check('plazo_credito_positivo', sql`${t.plazoSemanas} > 0`),
    check('saldo_no_negativo', sql`${t.saldoCentavos} >= 0`),
    check('total_cuadra', sql`${t.totalCentavos} = ${t.montoCentavos} + ${t.interesCentavos}`),
    check('saldo_hasta_total', sql`${t.saldoCentavos} <= ${t.totalCentavos}`),
    check(
      'liquidado_sin_saldo',
      sql`${t.estado} <> 'liquidado' OR (${t.saldoCentavos} = 0 AND ${t.liquidadoEn} IS NOT NULL)`,
    ),
  ],
)

// RF61: una fila por semana. La semana está pagada cuando cubierto = monto (RF66, RF68).
export const calendarioPagos = sqliteTable(
  'calendario_pagos',
  {
    id: text('id').primaryKey(),
    creditoId: text('credito_id').notNull().references(() => creditos.id),
    semana: integer('semana').notNull(),
    fechaVencimiento: text('fecha_vencimiento').notNull(),
    montoCentavos: integer('monto_centavos').notNull(),
    cubiertoCentavos: integer('cubierto_centavos').notNull().default(0),
  },
  (t) => [
    unique('calendario_semana_unica').on(t.creditoId, t.semana),
    check('semana_positiva', sql`${t.semana} > 0`),
    check('monto_semana_positivo', sql`${t.montoCentavos} > 0`),
    check('cubierto_hasta_monto', sql`${t.cubiertoCentavos} BETWEEN 0 AND ${t.montoCentavos}`),
  ],
)

export const TIPOS_OPERACION = ['desembolso', 'pago', 'abono', 'liquidacion', 'correccion'] as const

// RF60, RF115: historial de lo que cambia el saldo. Nunca se modifica ni se elimina.
export const operaciones = sqliteTable(
  'operaciones',
  {
    id: text('id').primaryKey(),
    folio: text('folio').notNull().unique(), // OP-000001 (RF113)
    creditoId: text('credito_id').notNull().references(() => creditos.id),
    tipo: text('tipo', { enum: TIPOS_OPERACION }).notNull(),
    semana: integer('semana'),
    montoCentavos: integer('monto_centavos').notNull(),
    saldoResultanteCentavos: integer('saldo_resultante_centavos').notNull(), // RF116
    operacionCorregidaId: text('operacion_corregida_id').references((): AnySQLiteColumn => operaciones.id),
    motivo: text('motivo'),
    claveIdempotencia: text('clave_idempotencia').notNull().unique(), // RN-24: un reintento no duplica
    registradoPor: text('registrado_por').notNull().references(() => usuarios.id),
    registradoEn: integer('registrado_en').notNull(),
  },
  (t) => [
    index('idx_operaciones_credito').on(t.creditoId, t.registradoEn),
    check(
      'tipo_operacion_valido',
      sql`${t.tipo} IN ('desembolso', 'pago', 'abono', 'liquidacion', 'correccion')`,
    ),
    check('correccion_con_original', sql`(${t.tipo} = 'correccion') = (${t.operacionCorregidaId} IS NOT NULL)`),
    check('correccion_con_motivo', sql`${t.tipo} <> 'correccion' OR ${t.motivo} IS NOT NULL`),
  ],
)

export const ESTADOS_RESPALDO = ['en_proceso', 'correcto', 'fallido'] as const

// RF117–RF121: registro de cada respaldo automático (lo escribe el Worker respaldos/)
export const respaldos = sqliteTable(
  'respaldos',
  {
    id: text('id').primaryKey(),
    iniciadoEn: integer('iniciado_en').notNull(),
    terminadoEn: integer('terminado_en'),
    estado: text('estado', { enum: ESTADOS_RESPALDO }).notNull(),
    archivo: text('archivo'), // ubicación del respaldo en R2
    tamanoBytes: integer('tamano_bytes'),
    error: text('error'),
  },
  (t) => [
    index('idx_respaldos_fecha').on(t.iniciadoEn),
    check('estado_respaldo_valido', sql`${t.estado} IN ('en_proceso', 'correcto', 'fallido')`),
  ],
)

// RF113: último número de cada serie de folios ('CR' créditos, 'OP' operaciones)
export const folios = sqliteTable('folios', {
  serie: text('serie').primaryKey(),
  ultimo: integer('ultimo').notNull().default(0),
})

export type Usuario = typeof usuarios.$inferSelect
export type Sesion = typeof sesiones.$inferSelect
export type Cliente = typeof clientes.$inferSelect
