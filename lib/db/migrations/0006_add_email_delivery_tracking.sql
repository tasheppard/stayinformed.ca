-- Add delivery tracking fields to weekly_digest_sent
ALTER TABLE "weekly_digest_sent"
  ADD COLUMN IF NOT EXISTS "resend_id" varchar(100),
  ADD COLUMN IF NOT EXISTS "delivery_status" varchar(50),
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp,
  ADD COLUMN IF NOT EXISTS "bounced_at" timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Create email_delivery_events table for webhook tracking
CREATE TABLE IF NOT EXISTS "email_delivery_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" varchar(100) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "resend_id" varchar(100),
  "user_id" varchar(255),
  "email" varchar(255),
  "status" varchar(50),
  "payload" jsonb,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add foreign key constraint to users
ALTER TABLE "email_delivery_events"
  ADD CONSTRAINT "email_delivery_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- Add unique index for idempotent webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS "email_delivery_events_event_id_unique"
  ON "email_delivery_events" ("event_id");
--> statement-breakpoint
-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS "email_delivery_events_resend_id_idx"
  ON "email_delivery_events" ("resend_id");
CREATE INDEX IF NOT EXISTS "email_delivery_events_user_id_idx"
  ON "email_delivery_events" ("user_id");
CREATE INDEX IF NOT EXISTS "email_delivery_events_event_type_idx"
  ON "email_delivery_events" ("event_type");
