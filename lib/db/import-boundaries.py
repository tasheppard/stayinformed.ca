#!/usr/bin/env python3
"""
Import GeoJSON federal riding boundaries into PostGIS database
Usage: python3 lib/db/import-boundaries.py <path-to-geojson>
"""
import json
import sys
import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('❌ DATABASE_URL environment variable is not set')
    sys.exit(1)

# Parse DATABASE_URL
# Format: postgresql://user:password@host:port/database
url_parts = DATABASE_URL.replace('postgresql://', '').split('@')
if len(url_parts) != 2:
    print('❌ Invalid DATABASE_URL format')
    sys.exit(1)

user_pass = url_parts[0].split(':')
host_db = url_parts[1].split('/')
host_port = host_db[0].split(':')

db_user = user_pass[0]
db_password = user_pass[1] if len(user_pass) > 1 else ''
db_host = host_port[0]
db_port = host_port[1] if len(host_port) > 1 else '5432'
db_name = host_db[1] if len(host_db) > 1 else 'postgres'

# Province code mapping
PROVINCE_MAP = {
    '10': 'Newfoundland and Labrador',
    '11': 'Prince Edward Island',
    '12': 'Nova Scotia',
    '13': 'New Brunswick',
    '24': 'Quebec',
    '35': 'Ontario',
    '46': 'Manitoba',
    '47': 'Saskatchewan',
    '48': 'Alberta',
    '59': 'British Columbia',
    '60': 'Yukon',
    '61': 'Northwest Territories',
    '62': 'Nunavut',
}

def get_province_name(code):
    return PROVINCE_MAP.get(code, None)

def import_feature(cursor, feature):
    """Import a single feature into the database"""
    properties = feature.get('properties', {})
    
    # Get riding name
    riding_name = (
        properties.get('FEDNAME') or
        properties.get('FEDENAME') or
        properties.get('FEDFNAME') or
        properties.get('ED_NAME') or
        properties.get('EDNAME') or
        properties.get('NAME') or
        'Unknown'
    )
    
    # Get province
    province_code = properties.get('PRUID') or properties.get('PROV') or ''
    province = (
        get_province_name(province_code) or
        properties.get('PRNAME') or
        properties.get('PROVINCE') or
        'Unknown'
    )
    
    # Check if coordinates need transformation
    geometry = feature.get('geometry', {})
    coords = geometry.get('coordinates', [])
    
    # Sample coordinate to check if projected
    needs_transform = False
    if coords and len(coords) > 0:
        try:
            # Navigate through nested coordinate arrays
            sample = coords[0]
            while isinstance(sample, list) and len(sample) > 0:
                sample = sample[0]
            if isinstance(sample, (int, float)):
                needs_transform = abs(sample) > 180
        except (IndexError, TypeError):
            pass
    
    geometry_json = json.dumps(geometry)
    
    # Insert into database
    try:
        if needs_transform:
            # Transform from EPSG:3978 to WGS84
            # Use ST_MakeValid to fix any self-intersection issues after transformation
            # Handle both Polygon and MultiPolygon geometries
            geom_type = geometry.get('type', '')
            if geom_type == 'MultiPolygon':
                # Already MultiPolygon, don't wrap in ST_Multi
                cursor.execute("""
                    INSERT INTO riding_boundaries (riding_name, province, geom)
                    SELECT 
                        %s,
                        %s,
                        ST_MakeValid(
                            ST_Transform(
                                ST_SetSRID(
                                    ST_GeomFromGeoJSON(%s),
                                    3978
                                ),
                                4326
                            )
                        )::geography
                    WHERE ST_IsValid(
                        ST_MakeValid(
                            ST_Transform(
                                ST_SetSRID(
                                    ST_GeomFromGeoJSON(%s),
                                    3978
                                ),
                                4326
                            )
                        )
                    )
                    ON CONFLICT DO NOTHING
                """, (riding_name, province, geometry_json, geometry_json))
            else:
                # Polygon, wrap in ST_Multi
                cursor.execute("""
                    INSERT INTO riding_boundaries (riding_name, province, geom)
                    SELECT 
                        %s,
                        %s,
                        ST_MakeValid(
                            ST_Transform(
                                ST_Multi(
                                    ST_SetSRID(
                                        ST_GeomFromGeoJSON(%s),
                                        3978
                                    )
                                ),
                                4326
                            )
                        )::geography
                    WHERE ST_IsValid(
                        ST_MakeValid(
                            ST_Transform(
                                ST_Multi(
                                    ST_SetSRID(
                                        ST_GeomFromGeoJSON(%s),
                                        3978
                                    )
                                ),
                                4326
                            )
                        )
                    )
                    ON CONFLICT DO NOTHING
                """, (riding_name, province, geometry_json, geometry_json))
        else:
            # Already in WGS84
            cursor.execute("""
                INSERT INTO riding_boundaries (riding_name, province, geom)
                VALUES (
                    %s,
                    %s,
                    ST_Multi(ST_GeomFromGeoJSON(%s))::geography
                )
                ON CONFLICT DO NOTHING
            """, (riding_name, province, geometry_json))
        
        return True
    except Exception as e:
        print(f"  Error importing feature: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print('Usage: python3 lib/db/import-boundaries.py <path-to-geojson>')
        sys.exit(1)
    
    geojson_path = sys.argv[1]
    
    if not os.path.exists(geojson_path):
        print(f'❌ File not found: {geojson_path}')
        sys.exit(1)
    
    print(f'Reading GeoJSON: {geojson_path}')
    
    # Connect to database
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            database=db_name,
            user=db_user,
            password=db_password
        )
        cursor = conn.cursor()
    except Exception as e:
        print(f'❌ Database connection failed: {e}')
        sys.exit(1)
    
    try:
        # Read and parse GeoJSON
        print('Loading GeoJSON file...')
        with open(geojson_path, 'r') as f:
            geojson = json.load(f)
        
        features = geojson.get('features', [])
        print(f'Found {len(features)} features')
        
        imported = 0
        errors = 0
        
        # Import each feature
        for i, feature in enumerate(features):
            if import_feature(cursor, feature):
                imported += 1
                if imported % 10 == 0:
                    print(f'  Imported {imported} boundaries...')
            else:
                errors += 1
        
        conn.commit()
        
        print(f'\n✅ Import completed:')
        print(f'   Imported: {imported}')
        print(f'   Errors: {errors}')
        
        # Verify import
        cursor.execute('SELECT COUNT(*) FROM riding_boundaries')
        count = cursor.fetchone()[0]
        print(f'\n📊 Total boundaries in database: {count}')
        
    except Exception as e:
        conn.rollback()
        print(f'❌ Error importing boundaries: {e}')
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()

