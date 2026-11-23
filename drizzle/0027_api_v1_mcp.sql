CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"request_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"request_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"kind" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"code_challenge" text,
	"redirect_uri" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_client_id_oauth_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_grant_id_oauth_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uq" ON "api_key" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "api_key_org_idx" ON "api_key" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_client_org_idx" ON "oauth_client" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_grant_org_idx" ON "oauth_grant" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_grant_client_user_idx" ON "oauth_grant" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_token_hash_uq" ON "oauth_token" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "oauth_token_grant_idx" ON "oauth_token" USING btree ("grant_id");