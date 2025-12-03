# Database Setup Guide

## Prerequisites

1. Ensure you have `.env.local` file with `DATABASE_URL` set to your Supabase connection string
2. Supabase project should be created and accessible

## Setup Steps

### 1. Enable PostGIS Extension

Run the PostGIS migration in Supabase:

```bash
# Option 1: Using Supabase CLI (if using local development)
supabase db push

# Option 2: Run manually in Supabase SQL Editor
# Copy contents of supabase/migrations/20241203000000_enable_postgis.sql
```

### 2. Generate Drizzle Migrations

```bash
npm run db:migrate:generate
```

This will create migration files in `lib/db/migrations/` based on your schema.

### 3. Run Migrations

```bash
npm run db:migrate
```

This will apply all migrations to your database.

### 4. Seed Scoring Weights

```bash
npm run db:seed
```

This will populate the `scoring_weights` table with default values.

### 5. Import Riding Boundary Data (Task 2.15)

Once you have the GeoJSON data for Canadian riding boundaries, you'll need to:

1. Convert GeoJSON to PostGIS format
2. Import into `riding_boundaries` table
3. Ensure the spatial index is created (already in migration file)

## Available Scripts

- `npm run db:generate` - Generate migration files from schema changes
- `npm run db:migrate` - Run pending migrations
- `npm run db:push` - Push schema changes directly (development only)
- `npm run db:studio` - Open Drizzle Studio to view/edit data
- `npm run db:seed` - Seed default scoring weights

## Schema Files

- `lib/db/schema.ts` - Main schema definitions
- `lib/db/index.ts` - Database connection and export
- `lib/db/seed.ts` - Seed functions
- `lib/db/migrate.ts` - Migration runner

