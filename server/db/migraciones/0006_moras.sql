CREATE TABLE `moras` (
	`id` text PRIMARY KEY NOT NULL,
	`credito_id` text NOT NULL,
	`semana` integer NOT NULL,
	`monto_centavos` integer NOT NULL,
	`pagado_centavos` integer DEFAULT 0 NOT NULL,
	`condonado_centavos` integer DEFAULT 0 NOT NULL,
	`generada_en` integer NOT NULL,
	FOREIGN KEY (`credito_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mora_positiva" CHECK("moras"."monto_centavos" > 0),
	CONSTRAINT "mora_cubierta_hasta_monto" CHECK("moras"."pagado_centavos" >= 0 AND "moras"."condonado_centavos" >= 0 AND "moras"."pagado_centavos" + "moras"."condonado_centavos" <= "moras"."monto_centavos")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mora_semana_unica` ON `moras` (`credito_id`,`semana`);--> statement-breakpoint
ALTER TABLE `operaciones` ADD `mora_centavos` integer DEFAULT 0 NOT NULL;