-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_number" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"sponsor_mp_id" integer,
	"introduction_date" timestamp,
	"status" varchar(100),
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bills_bill_number_unique" UNIQUE("bill_number")
);
--> statement-breakpoint
CREATE TABLE "calculated_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"mp_id" integer NOT NULL,
	"overall_score" numeric(5, 2) NOT NULL,
	"legislative_activity_score" numeric(5, 2) NOT NULL,
	"fiscal_responsibility_score" numeric(5, 2) NOT NULL,
	"constituent_engagement_score" numeric(5, 2) NOT NULL,
	"voting_participation_score" numeric(5, 2) NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_participation" (
	"id" serial PRIMARY KEY NOT NULL,
	"mp_id" integer NOT NULL,
	"committee_name" varchar(255) NOT NULL,
	"role" varchar(100),
	"start_date" timestamp,
	"end_date" timestamp,
	"meeting_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"mp_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"mp_id" integer NOT NULL,
	"fiscal_year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"category" varchar(100) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"transaction_details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mps" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"constituency_name" varchar(255) NOT NULL,
	"province" varchar(100) NOT NULL,
	"caucus_short_name" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mps_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "petitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"petition_number" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"sponsor_mp_id" integer,
	"presented_date" timestamp,
	"status" varchar(100),
	"signature_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "petitions_petition_number_unique" UNIQUE("petition_number")
);
--> statement-breakpoint
CREATE TABLE "riding_boundaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"riding_name" varchar(255) NOT NULL,
	"province" varchar(100) NOT NULL,
	"geom" geography(MULTIPOLYGON, 4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_weights" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"weight_value" numeric(3, 2) NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_weights_metric_name_unique" UNIQUE("metric_name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"is_premium" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"subscription_status" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"mp_id" integer NOT NULL,
	"vote_number" integer NOT NULL,
	"session" varchar(50) NOT NULL,
	"date" timestamp NOT NULL,
	"bill_number" varchar(50),
	"bill_title" text,
	"vote_result" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_sponsor_mp_id_mps_id_fk" FOREIGN KEY ("sponsor_mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculated_scores" ADD CONSTRAINT "calculated_scores_mp_id_mps_id_fk" FOREIGN KEY ("mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_participation" ADD CONSTRAINT "committee_participation_mp_id_mps_id_fk" FOREIGN KEY ("mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_mp_id_mps_id_fk" FOREIGN KEY ("mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_mp_id_mps_id_fk" FOREIGN KEY ("mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petitions" ADD CONSTRAINT "petitions_sponsor_mp_id_mps_id_fk" FOREIGN KEY ("sponsor_mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_mp_id_mps_id_fk" FOREIGN KEY ("mp_id") REFERENCES "public"."mps"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Create spatial index on riding_boundaries.geom
CREATE INDEX IF NOT EXISTS idx_riding_boundaries_geom 
ON riding_boundaries 
USING GIST (geom);