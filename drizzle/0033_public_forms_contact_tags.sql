CREATE TABLE "contact_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tag_assignment" (
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tag_assignment_organization_id_contact_id_tag_id_pk" PRIMARY KEY("organization_id","contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "public_form_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_enabled" boolean DEFAULT false NOT NULL,
	"booking_enabled" boolean DEFAULT false NOT NULL,
	"webhook_secret_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contact_tag" ADD CONSTRAINT "contact_tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignment" ADD CONSTRAINT "contact_tag_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignment" ADD CONSTRAINT "contact_tag_assignment_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignment" ADD CONSTRAINT "contact_tag_assignment_tag_id_contact_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."contact_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_form_settings" ADD CONSTRAINT "public_form_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_tag_org_name_uq" ON "contact_tag" USING btree ("organization_id","name_key");--> statement-breakpoint
CREATE INDEX "contact_tag_org_idx" ON "contact_tag" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_tag_assignment_org_tag_idx" ON "contact_tag_assignment" USING btree ("organization_id","tag_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_form_settings_org_uq" ON "public_form_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contact_org_email_idx" ON "contact" USING btree ("organization_id","email");