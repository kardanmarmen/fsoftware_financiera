CREATE TABLE `respaldos` (
	`id` text PRIMARY KEY NOT NULL,
	`iniciado_en` integer NOT NULL,
	`terminado_en` integer,
	`estado` text NOT NULL,
	`archivo` text,
	`tamano_bytes` integer,
	`error` text,
	CONSTRAINT "estado_respaldo_valido" CHECK("respaldos"."estado" IN ('en_proceso', 'correcto', 'fallido'))
);
--> statement-breakpoint
CREATE INDEX `idx_respaldos_fecha` ON `respaldos` (`iniciado_en`);