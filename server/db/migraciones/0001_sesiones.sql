CREATE TABLE `sesiones` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text NOT NULL,
	`creada_en` integer NOT NULL,
	`ultima_actividad_en` integer NOT NULL,
	`cerrada_en` integer,
	`motivo_cierre` text,
	`dispositivo` text,
	`ip` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "motivo_cierre_valido" CHECK("sesiones"."motivo_cierre" IN ('salida', 'nuevo_inicio', 'domingo', 'inactividad', 'desactivado', 'restablecimiento', 'cambio_contrasena'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sesiones_una_abierta` ON `sesiones` (`usuario_id`) WHERE "sesiones"."cerrada_en" IS NULL;