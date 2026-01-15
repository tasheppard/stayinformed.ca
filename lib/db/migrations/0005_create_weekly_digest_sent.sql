-- Create weekly_digest_sent table for tracking sent weekly digests
-- Prevents duplicate emails on job retry
CREATE TABLE IF NOT EXISTS "weekly_digest_sent" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"week_identifier" varchar(20) NOT NULL,
	"job_id" varchar(100),
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add foreign key constraint
ALTER TABLE "weekly_digest_sent" ADD CONSTRAINT "weekly_digest_sent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- Add unique constraint: one email per user per week
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_digest_sent_user_id_week_identifier_unique" ON "weekly_digest_sent" ("user_id", "week_identifier");
--> statement-breakpoint
-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS "weekly_digest_sent_week_identifier_idx" ON "weekly_digest_sent" ("week_identifier");
CREATE INDEX IF NOT EXISTS "weekly_digest_sent_user_id_idx" ON "weekly_digest_sent" ("user_id");
CREATE INDEX IF NOT EXISTS "weekly_digest_sent_sent_at_idx" ON "weekly_digest_sent" ("sent_at");

