ALTER TABLE "organization" ADD COLUMN "plan" varchar(20) DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "max_agents" integer DEFAULT 3 NOT NULL;