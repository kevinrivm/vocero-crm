ALTER TABLE "dispatch" ADD COLUMN "relaunch_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "safety_net_at" timestamp;--> statement-breakpoint
-- Lo entregado antes de esta versión ya no lo revisa la red de seguridad: al actualizar no se relanza ningún turno viejo.
UPDATE "dispatch" SET "safety_net_at" = now() WHERE "status" = 'entregado' AND "safety_net_at" IS NULL;--> statement-breakpoint
CREATE INDEX "dispatch_red_seguridad_idx" ON "dispatch" USING btree ("updated_at") WHERE "dispatch"."status" = 'entregado' and "dispatch"."safety_net_at" is null;
