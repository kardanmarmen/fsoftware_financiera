CREATE TABLE `calendario_pagos` (
	`id` text PRIMARY KEY NOT NULL,
	`credito_id` text NOT NULL,
	`semana` integer NOT NULL,
	`fecha_vencimiento` text NOT NULL,
	`monto_centavos` integer NOT NULL,
	`cubierto_centavos` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`credito_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "semana_positiva" CHECK("calendario_pagos"."semana" > 0),
	CONSTRAINT "monto_semana_positivo" CHECK("calendario_pagos"."monto_centavos" > 0),
	CONSTRAINT "cubierto_hasta_monto" CHECK("calendario_pagos"."cubierto_centavos" BETWEEN 0 AND "calendario_pagos"."monto_centavos")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendario_semana_unica` ON `calendario_pagos` (`credito_id`,`semana`);--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`curp` text NOT NULL,
	`nombre` text NOT NULL,
	`apellido_paterno` text NOT NULL,
	`apellido_materno` text,
	`nombre_busqueda` text NOT NULL,
	`fecha_nacimiento` text NOT NULL,
	`telefono` text NOT NULL,
	`telefono_alterno` text,
	`correo` text,
	`calle` text NOT NULL,
	`numero_exterior` text NOT NULL,
	`numero_interior` text,
	`colonia` text NOT NULL,
	`municipio` text NOT NULL,
	`estado` text NOT NULL,
	`codigo_postal` text NOT NULL,
	`referencias_domicilio` text,
	`notas` text,
	`cobrador_id` text NOT NULL,
	`creado_por` text NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	FOREIGN KEY (`cobrador_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "curp_longitud" CHECK(LENGTH("clientes"."curp") = 18),
	CONSTRAINT "codigo_postal_longitud" CHECK(LENGTH("clientes"."codigo_postal") = 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_curp_unique` ON `clientes` (`curp`);--> statement-breakpoint
CREATE INDEX `idx_clientes_cobrador` ON `clientes` (`cobrador_id`);--> statement-breakpoint
CREATE INDEX `idx_clientes_nombre` ON `clientes` (`nombre_busqueda`);--> statement-breakpoint
CREATE INDEX `idx_clientes_telefono` ON `clientes` (`telefono`);--> statement-breakpoint
CREATE TABLE `cobrador_modelos` (
	`cobrador_id` text NOT NULL,
	`modelo_id` text NOT NULL,
	`asignado_por` text NOT NULL,
	`asignado_en` integer NOT NULL,
	PRIMARY KEY(`cobrador_id`, `modelo_id`),
	FOREIGN KEY (`cobrador_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modelo_id`) REFERENCES `modelos_credito`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asignado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `creditos` (
	`id` text PRIMARY KEY NOT NULL,
	`folio` text NOT NULL,
	`solicitud_id` text NOT NULL,
	`cliente_id` text NOT NULL,
	`cobrador_id` text NOT NULL,
	`modelo_id` text NOT NULL,
	`monto_centavos` integer NOT NULL,
	`tasa_interes_bp` integer NOT NULL,
	`plazo_semanas` integer NOT NULL,
	`mora_semanal_centavos` integer NOT NULL,
	`interes_centavos` integer NOT NULL,
	`total_centavos` integer NOT NULL,
	`pago_semanal_centavos` integer NOT NULL,
	`saldo_centavos` integer NOT NULL,
	`estado` text DEFAULT 'aprobado' NOT NULL,
	`fecha_desembolso` text NOT NULL,
	`aceptado_en` integer,
	`liquidado_en` integer,
	`tipo_liquidacion` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cobrador_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modelo_id`) REFERENCES `modelos_credito`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "estado_credito_valido" CHECK("creditos"."estado" IN ('aprobado', 'aceptado', 'liquidado', 'cancelado')),
	CONSTRAINT "tipo_liquidacion_valido" CHECK("creditos"."tipo_liquidacion" IN ('normal', 'anticipada')),
	CONSTRAINT "monto_credito_positivo" CHECK("creditos"."monto_centavos" > 0),
	CONSTRAINT "plazo_credito_positivo" CHECK("creditos"."plazo_semanas" > 0),
	CONSTRAINT "saldo_no_negativo" CHECK("creditos"."saldo_centavos" >= 0),
	CONSTRAINT "total_cuadra" CHECK("creditos"."total_centavos" = "creditos"."monto_centavos" + "creditos"."interes_centavos"),
	CONSTRAINT "saldo_hasta_total" CHECK("creditos"."saldo_centavos" <= "creditos"."total_centavos"),
	CONSTRAINT "liquidado_sin_saldo" CHECK("creditos"."estado" <> 'liquidado' OR ("creditos"."saldo_centavos" = 0 AND "creditos"."liquidado_en" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creditos_folio_unique` ON `creditos` (`folio`);--> statement-breakpoint
CREATE UNIQUE INDEX `creditos_solicitud_id_unique` ON `creditos` (`solicitud_id`);--> statement-breakpoint
CREATE INDEX `idx_creditos_cliente` ON `creditos` (`cliente_id`,`estado`);--> statement-breakpoint
CREATE INDEX `idx_creditos_cobrador` ON `creditos` (`cobrador_id`,`estado`);--> statement-breakpoint
CREATE TABLE `folios` (
	`serie` text PRIMARY KEY NOT NULL,
	`ultimo` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `modelos_credito` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`tasa_interes_bp` integer NOT NULL,
	`plazo_semanas` integer NOT NULL,
	`mora_semanal_centavos` integer NOT NULL,
	`semanas_para_renovar` integer NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_por` text NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tipo_modelo_valido" CHECK("modelos_credito"."tipo" IN ('interes_fijo')),
	CONSTRAINT "tasa_no_negativa" CHECK("modelos_credito"."tasa_interes_bp" >= 0),
	CONSTRAINT "plazo_modelo_positivo" CHECK("modelos_credito"."plazo_semanas" > 0),
	CONSTRAINT "mora_modelo_no_negativa" CHECK("modelos_credito"."mora_semanal_centavos" >= 0),
	CONSTRAINT "semanas_renovar_no_negativas" CHECK("modelos_credito"."semanas_para_renovar" >= 0),
	CONSTRAINT "modelo_activo_valido" CHECK("modelos_credito"."activo" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modelos_credito_nombre_unique` ON `modelos_credito` (`nombre`);--> statement-breakpoint
CREATE TABLE `operaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`folio` text NOT NULL,
	`credito_id` text NOT NULL,
	`tipo` text NOT NULL,
	`semana` integer,
	`monto_centavos` integer NOT NULL,
	`saldo_resultante_centavos` integer NOT NULL,
	`operacion_corregida_id` text,
	`motivo` text,
	`clave_idempotencia` text NOT NULL,
	`registrado_por` text NOT NULL,
	`registrado_en` integer NOT NULL,
	FOREIGN KEY (`credito_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operacion_corregida_id`) REFERENCES `operaciones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tipo_operacion_valido" CHECK("operaciones"."tipo" IN ('desembolso', 'pago', 'abono', 'liquidacion', 'correccion')),
	CONSTRAINT "correccion_con_original" CHECK(("operaciones"."tipo" = 'correccion') = ("operaciones"."operacion_corregida_id" IS NOT NULL)),
	CONSTRAINT "correccion_con_motivo" CHECK("operaciones"."tipo" <> 'correccion' OR "operaciones"."motivo" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operaciones_folio_unique` ON `operaciones` (`folio`);--> statement-breakpoint
CREATE UNIQUE INDEX `operaciones_clave_idempotencia_unique` ON `operaciones` (`clave_idempotencia`);--> statement-breakpoint
CREATE INDEX `idx_operaciones_credito` ON `operaciones` (`credito_id`,`registrado_en`);--> statement-breakpoint
CREATE TABLE `solicitudes` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text NOT NULL,
	`cobrador_id` text NOT NULL,
	`modelo_id` text NOT NULL,
	`tipo` text NOT NULL,
	`credito_anterior_id` text,
	`monto_solicitado_centavos` integer NOT NULL,
	`ocupacion` text,
	`ingreso_semanal_centavos` integer,
	`tasa_interes_bp` integer NOT NULL,
	`plazo_semanas` integer NOT NULL,
	`mora_semanal_centavos` integer NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`monto_aprobado_centavos` integer,
	`fecha_desembolso` text,
	`motivo` text,
	`revisada_por` text,
	`revisada_en` integer,
	`creado_por` text NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cobrador_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modelo_id`) REFERENCES `modelos_credito`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credito_anterior_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revisada_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tipo_solicitud_valido" CHECK("solicitudes"."tipo" IN ('nueva', 'renovacion')),
	CONSTRAINT "estado_solicitud_valido" CHECK("solicitudes"."estado" IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
	CONSTRAINT "monto_solicitado_positivo" CHECK("solicitudes"."monto_solicitado_centavos" > 0),
	CONSTRAINT "plazo_solicitud_positivo" CHECK("solicitudes"."plazo_semanas" > 0),
	CONSTRAINT "renovacion_con_credito_anterior" CHECK(("solicitudes"."tipo" = 'renovacion') = ("solicitudes"."credito_anterior_id" IS NOT NULL)),
	CONSTRAINT "motivo_al_rechazar" CHECK("solicitudes"."estado" NOT IN ('rechazada', 'cancelada') OR "solicitudes"."motivo" IS NOT NULL),
	CONSTRAINT "aprobada_con_monto_y_fecha" CHECK("solicitudes"."estado" <> 'aprobada' OR ("solicitudes"."monto_aprobado_centavos" > 0 AND "solicitudes"."fecha_desembolso" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_solicitudes_cliente` ON `solicitudes` (`cliente_id`,`creado_en`);--> statement-breakpoint
CREATE INDEX `idx_solicitudes_cobrador` ON `solicitudes` (`cobrador_id`,`estado`);