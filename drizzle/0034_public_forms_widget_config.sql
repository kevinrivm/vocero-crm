CREATE TABLE "public_form_tag_assignment" (
	"organization_id" text NOT NULL,
	"form_kind" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_form_tag_assignment_organization_id_form_kind_tag_id_pk" PRIMARY KEY("organization_id","form_kind","tag_id")
);
--> statement-breakpoint
ALTER TABLE "public_form_settings" ADD COLUMN "contact_form_config" jsonb DEFAULT '{"version":1,"title":"Hablemos","description":"Déjanos tus datos y el equipo te contactará.","submitLabel":"Enviar mis datos","fields":[{"key":"name","label":"Nombre","enabled":true,"required":true,"position":0},{"key":"phone","label":"Teléfono","enabled":true,"required":true,"position":1},{"key":"email","label":"Correo","enabled":true,"required":false,"position":2}]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "public_form_settings" ADD COLUMN "booking_form_config" jsonb DEFAULT '{"version":1,"title":"Agenda tu cita","description":"Elige una fecha y horario disponibles para confirmar tu cita.","submitLabel":"Confirmar cita","fields":[{"key":"name","label":"Nombre","enabled":true,"required":true,"position":0},{"key":"phone","label":"Teléfono","enabled":true,"required":true,"position":1},{"key":"email","label":"Correo","enabled":true,"required":false,"position":2}]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "public_form_settings" ADD COLUMN "allowed_origins" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "public_form_tag_assignment" ADD CONSTRAINT "public_form_tag_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_form_tag_assignment" ADD CONSTRAINT "public_form_tag_assignment_tag_id_contact_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."contact_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_form_tag_assignment_org_kind_idx" ON "public_form_tag_assignment" USING btree ("organization_id","form_kind");