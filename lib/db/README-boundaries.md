# Importing Riding Boundaries

## Step 1: Convert Shapefile to GeoJSON

Place your shapefile files (.shp, .shx, .dbf, .prj) in the `data/shapefiles/` directory, then run:

```bash
npm run db:convert-shapefile data/shapefiles/your-file.shp data/geojson/ridings.geojson
```

Or if you want to use the default output path (same name as .shp file but with .geojson extension):

```bash
npm run db:convert-shapefile data/shapefiles/your-file.shp
```

## Step 2: Import GeoJSON into Database

After converting to GeoJSON, import it into your PostGIS database:

```bash
npm run db:import-boundaries data/geojson/ridings.geojson
```

The script will:
- Read the GeoJSON file
- Extract riding names and provinces from feature properties
- Convert GeoJSON geometries to PostGIS geography format
- Insert into the `riding_boundaries` table
- Skip duplicates if they already exist

## Property Field Mapping

The import script looks for these property fields in your GeoJSON (in order of preference):

**Riding Name:**
- `ED_NAME`
- `NAME`
- `riding_name`
- `name`

**Province:**
- `PROVINCE`
- `province`
- `PROV`
- `prov`

If your shapefile uses different field names, you can modify `lib/db/import-boundaries.ts` to match your data structure.

## Verification

After importing, verify the data:

```bash
# Using Supabase SQL Editor or psql
SELECT COUNT(*) FROM riding_boundaries;
SELECT riding_name, province FROM riding_boundaries LIMIT 10;
```

## Troubleshooting

**Error: "type geography does not exist"**
- Make sure PostGIS extension is enabled: Run the migration `supabase/migrations/20241203000000_enable_postgis.sql`

**Error: "Invalid geometry"**
- Ensure your shapefile uses WGS84 (EPSG:4326) coordinate system
- Check that geometries are valid MultiPolygon features

**Missing properties**
- Check your GeoJSON file to see what properties are available
- Update the property field mapping in `import-boundaries.ts` if needed

