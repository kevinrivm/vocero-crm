CREATE TABLE "ia_vuelta" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"motivo" text NOT NULL,
	"horas" integer,
	"pausada_desde" timestamp,
	"motivo_pausa" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_profile" ADD COLUMN "reactivate_after_hours" integer;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "ai_paused_until" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "last_team_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "ia_vuelta" ADD CONSTRAINT "ia_vuelta_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ia_vuelta" ADD CONSTRAINT "ia_vuelta_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_vuelta_org_conv_idx" ON "ia_vuelta" USING btree ("organization_id","conversation_id","occurred_at");--> statement-breakpoint
-- 076: la última salida del equipo en las conversaciones que ya existían.
-- Desde aquí la anota quien envía; para lo de antes se toma cualquier saliente
-- que no escribió la IA. Cuenta de más (un recordatorio pasa por persona), y
-- es a propósito: equivocarse así solo retrasa que la IA vuelva.
UPDATE "conversation" AS c
SET "last_team_out_at" = s.ultimo
FROM (
  SELECT "organization_id", "conversation_id", max("created_at") AS ultimo
  FROM "message"
  WHERE "direction" = 'out' AND "ai_generated" = false AND "status" <> 'failed'
  GROUP BY "organization_id", "conversation_id"
) AS s
WHERE c."organization_id" = s."organization_id" AND c."id" = s."conversation_id";
