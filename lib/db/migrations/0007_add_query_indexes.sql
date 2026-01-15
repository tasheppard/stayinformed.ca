-- Add indexes to optimize common queries
CREATE INDEX IF NOT EXISTS "votes_mp_id_date_idx"
  ON "votes" ("mp_id", "date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_mp_id_fiscal_year_quarter_idx"
  ON "expenses" ("mp_id", "fiscal_year", "quarter");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_sponsor_mp_id_idx"
  ON "bills" ("sponsor_mp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petitions_sponsor_mp_id_idx"
  ON "petitions" ("sponsor_mp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_participation_mp_id_idx"
  ON "committee_participation" ("mp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calculated_scores_mp_id_calculated_at_idx"
  ON "calculated_scores" ("mp_id", "calculated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_subscriptions_user_id_idx"
  ON "email_subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_subscriptions_mp_id_idx"
  ON "email_subscriptions" ("mp_id");
