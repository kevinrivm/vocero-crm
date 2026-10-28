CREATE TABLE "internal_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_id" text,
	"channel" text DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "assigned_user_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "internal_message" ADD CONSTRAINT "internal_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_message" ADD CONSTRAINT "internal_message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_message" ADD CONSTRAINT "internal_message_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_msg_org_created_idx" ON "internal_message" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "internal_msg_org_channel_idx" ON "internal_message" USING btree ("organization_id","channel","created_at");--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;