-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create spatial index on riding_boundaries.geom for fast geolocation queries
-- This will be created after the table is created by Drizzle migrations
-- Run this after running Drizzle migrations

CREATE INDEX IF NOT EXISTS idx_riding_boundaries_geom 
ON riding_boundaries 
USING GIST (geom);

