-- Phase 3: Add UNIQUE constraint and index on personId
-- This migration should only be run after Phase 2 backfill is 100% complete
-- and all unmatched MPs have been manually reviewed and updated if needed.

-- Add UNIQUE constraint on person_id (only for non-null values)
-- Note: PostgreSQL allows multiple NULL values in a UNIQUE column
CREATE UNIQUE INDEX IF NOT EXISTS "mps_person_id_unique" ON "mps" ("person_id") WHERE "person_id" IS NOT NULL;

-- Add index for faster lookups by personId
CREATE INDEX IF NOT EXISTS "mps_person_id_idx" ON "mps" ("person_id");

