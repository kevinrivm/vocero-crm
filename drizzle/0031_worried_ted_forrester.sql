CREATE TABLE "global_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"type" varchar(20) DEFAULT 'info' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
