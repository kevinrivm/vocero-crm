CREATE TABLE "ai_call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_log_org_created_idx" ON "ai_call_log" USING btree ("organization_id","created_at");