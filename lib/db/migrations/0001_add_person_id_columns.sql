ALTER TABLE "mps" ADD COLUMN "person_id" varchar(50);--> statement-breakpoint
ALTER TABLE "mps" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mps" ADD COLUMN "status" varchar(50) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "mps" ADD COLUMN "photo_last_modified" timestamp;