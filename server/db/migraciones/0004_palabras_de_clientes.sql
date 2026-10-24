CREATE TABLE `cliente_palabras` (
	`cliente_id` text NOT NULL,
	`palabra` text NOT NULL,
	PRIMARY KEY(`cliente_id`, `palabra`),
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cliente_palabras_palabra` ON `cliente_palabras` (`palabra`,`cliente_id`);--> statement-breakpoint
-- Llena el índice con los clientes que ya existen: separa nombre_busqueda ("perez lopez ana") en palabras.
-- Usa WITH RECURSIVE (estándar); substr e instr son de SQLite (en PostgreSQL: substring y strpos).
INSERT INTO `cliente_palabras` (`cliente_id`, `palabra`)
WITH RECURSIVE partes (cliente_id, palabra, resto) AS (
	SELECT `id`, '', `nombre_busqueda` || ' ' FROM `clientes`
	UNION ALL
	SELECT cliente_id, substr(resto, 1, instr(resto, ' ') - 1), substr(resto, instr(resto, ' ') + 1)
	FROM partes WHERE resto <> ''
)
SELECT DISTINCT cliente_id, palabra FROM partes WHERE palabra <> '';
