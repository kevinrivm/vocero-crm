CREATE TABLE "calendar_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token_cipher" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"access_token_tag" text NOT NULL,
	"refresh_token_cipher" text,
	"refresh_token_iv" text,
	"refresh_token_tag" text,
	"expires_at" timestamp,
	"account_email" text,
	"account_name" text,
	"scope" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_role_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_integration" ADD CONSTRAINT "calendar_integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_permission" ADD CONSTRAINT "tenant_role_permission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_int_org_provider_uq" ON "calendar_integration" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "calendar_int_org_idx" ON "calendar_integration" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_role_perm_org_role_perm_uq" ON "tenant_role_permission" USING btree ("organization_id","role","permission");--> statement-breakpoint
CREATE INDEX "tenant_role_perm_org_idx" ON "tenant_role_permission" USING btree ("organization_id");