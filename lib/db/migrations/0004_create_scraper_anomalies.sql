-- Create scraper_anomalies table for tracking data validation issues flagged by scrapers
CREATE TABLE IF NOT EXISTS "scraper_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"scraper_name" varchar(100) NOT NULL,
	"job_id" varchar(100), -- Graphile Worker job ID (string in Graphile Worker 0.16.6+)
	"anomaly_type" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS "scraper_anomalies_scraper_name_idx" ON "scraper_anomalies" ("scraper_name");
CREATE INDEX IF NOT EXISTS "scraper_anomalies_status_idx" ON "scraper_anomalies" ("status");
CREATE INDEX IF NOT EXISTS "scraper_anomalies_severity_idx" ON "scraper_anomalies" ("severity");
CREATE INDEX IF NOT EXISTS "scraper_anomalies_created_at_idx" ON "scraper_anomalies" ("created_at");

