#!/bin/bash
# Helper script to connect to production database with psql
# Ensures psql is in PATH

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# Load DATABASE_URL from .env.production if not already set
if [ -z "$DATABASE_URL" ] && [ -f .env.production ]; then
  export DATABASE_URL=$(grep "^DATABASE_URL=" .env.production | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not found. Set it in .env.production or as environment variable."
  exit 1
fi

echo "🔗 Connecting to production database..."
echo "   (Using DATABASE_URL from .env.production)"
echo ""

# Parse DATABASE_URL and extract components for psql
# Format: postgresql://user:password@host:port/database
DB_URL="$DATABASE_URL"

# Extract components for better error messages
if [[ "$DB_URL" =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
  DB_USER="${BASH_REMATCH[1]}"
  DB_HOST="${BASH_REMATCH[3]}"
  DB_PORT="${BASH_REMATCH[4]}"
  DB_NAME="${BASH_REMATCH[5]}"
  echo "   Host: $DB_HOST"
  echo "   Port: $DB_PORT"
  echo "   Database: $DB_NAME"
  echo "   User: $DB_USER"
  echo ""
fi

# Note: psql will handle URL encoding automatically, but if there are issues,
# you may need to URL-encode the password manually
psql "$DB_URL"

