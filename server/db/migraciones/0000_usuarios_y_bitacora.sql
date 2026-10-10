CREATE TABLE `bitacora` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text,
	`gerente_id` text,
	`usuario_intentado` text,
	`accion` text NOT NULL,
	`entidad` text,
	`entidad_id` text,
	`detalle` text,
	`ip` text,
	`creado_en` integer NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bitacora_fecha` ON `bitacora` (`creado_en`);--> statement-breakpoint
CREATE INDEX `idx_bitacora_usuario` ON `bitacora` (`usuario_id`,`creado_en`);--> statement-breakpoint
CREATE INDEX `idx_bitacora_gerente` ON `bitacora` (`gerente_id`,`creado_en`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario` text NOT NULL,
	`nombre` text NOT NULL,
	`rol` text NOT NULL,
	`gerente_id` text,
	`contrasena_hash` text NOT NULL,
	`contrasena_temporal` integer DEFAULT false NOT NULL,
	`temporal_expira_en` integer,
	`activo` integer DEFAULT true NOT NULL,
	`creado_por` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	FOREIGN KEY (`gerente_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rol_valido" CHECK("usuarios"."rol" IN ('administrador', 'gerente', 'cobrador')),
	CONSTRAINT "contrasena_temporal_valida" CHECK("usuarios"."contrasena_temporal" IN (0, 1)),
	CONSTRAINT "activo_valido" CHECK("usuarios"."activo" IN (0, 1)),
	CONSTRAINT "gerente_solo_cobrador" CHECK(("usuarios"."rol" = 'cobrador' AND "usuarios"."gerente_id" IS NOT NULL) OR ("usuarios"."rol" <> 'cobrador' AND "usuarios"."gerente_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_usuario_unique` ON `usuarios` (`usuario`);--> statement-breakpoint
CREATE INDEX `idx_usuarios_gerente` ON `usuarios` (`gerente_id`);