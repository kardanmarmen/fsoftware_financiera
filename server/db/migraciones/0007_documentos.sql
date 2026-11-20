CREATE TABLE `documentos` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text NOT NULL,
	`solicitud_id` text,
	`credito_id` text,
	`tipo` text NOT NULL,
	`clave_archivo` text NOT NULL,
	`nombre_archivo` text NOT NULL,
	`tipo_mime` text NOT NULL,
	`tamano_bytes` integer NOT NULL,
	`subido_por` text NOT NULL,
	`subido_en` integer NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credito_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tipo_documento_valido" CHECK("documentos"."tipo" IN ('identificacion', 'comprobante_domicilio', 'solicitud_firmada', 'contrato_firmado', 'evidencia_desembolso', 'comprobante_liquidacion', 'otro')),
	CONSTRAINT "tamano_documento_positivo" CHECK("documentos"."tamano_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documentos_clave_archivo_unique` ON `documentos` (`clave_archivo`);--> statement-breakpoint
CREATE INDEX `idx_documentos_cliente` ON `documentos` (`cliente_id`,`subido_en`);--> statement-breakpoint
CREATE INDEX `idx_documentos_solicitud` ON `documentos` (`solicitud_id`);--> statement-breakpoint
CREATE INDEX `idx_documentos_credito` ON `documentos` (`credito_id`);