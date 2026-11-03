CREATE TABLE "tenant_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"platform" text NOT NULL,
	"provider_id" text NOT NULL,
	"token" text,
	"name" text NOT NULL,
	"enable_ai" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_channels" ADD CONSTRAINT "tenant_channels_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_channels" ADD CONSTRAINT "tenant_channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tc_org_idx" ON "tenant_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tc_tenant_idx" ON "tenant_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tc_provider_idx" ON "tenant_channels" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "tc_org_platform_idx" ON "tenant_channels" USING btree ("organization_id","platform");