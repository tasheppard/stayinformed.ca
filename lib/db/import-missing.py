#!/usr/bin/env python3
"""
Import the 3 missing boundaries
"""
import json
import sys
import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv('.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('❌ DATABASE_URL environment variable is not set')
    sys.exit(1)

url_parts = DATABASE_URL.replace('postgresql://', '').split('@')
user_pass = url_parts[0].split(':')
host_db = url_parts[1].split('/')
host_port = host_db[0].split(':')

db_user = user_pass[0]
db_password = user_pass[1] if len(user_pass) > 1 else ''
db_host = host_port[0]
db_port = host_port[1] if len(host_port) > 1 else '5432'
db_name = host_db[1] if len(host_db) > 1 else 'postgres'

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

MISSING_FEDUIDS = ['35082', '35100', '62001']

def import_feature(cursor, feature):
    """Import a single feature into the database"""
    properties = feature.get('properties', {})
    
    riding_name = (
        properties.get('FEDNAME') or
        properties.get('FEDENAME') or
        properties.get('FEDFNAME') or
        'Unknown'
    )
    
    province_code = properties.get('PRUID') or ''
    province = PROVINCE_MAP.get(province_code, 'Unknown')
    
    geometry = feature.get('geometry', {})
    geometry_json = json.dumps(geometry)
    
    # Check if coordinates need transformation
    coords = geometry.get('coordinates', [])
    needs_transform = False
    if coords and len(coords) > 0:
        try:
            sample = coords[0]
            while isinstance(sample, list) and len(sample) > 0:
                sample = sample[0]
            if isinstance(sample, (int, float)):
                needs_transform = abs(sample) > 180
        except (IndexError, TypeError):
            pass
    
    print(f'\n  Importing: {riding_name}, {province}')
    print(f'    FEDUID: {properties.get("FEDUID")}')
    print(f'    Geometry type: {geometry.get("type")}')
    print(f'    Needs transform: {needs_transform}')
    
    try:
        geom_type = geometry.get('type', '')
        
        if needs_transform:
            if geom_type == 'MultiPolygon':
                # Already MultiPolygon, use ST_MakeValid to fix self-intersections
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
                    RETURNING id
                """, (riding_name, province, geometry_json, geometry_json))
            else:
                # Polygon, wrap in ST_Multi and use ST_MakeValid
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
                    RETURNING id
                """, (riding_name, province, geometry_json, geometry_json))
        else:
            cursor.execute("""
                INSERT INTO riding_boundaries (riding_name, province, geom)
                VALUES (
                    %s,
                    %s,
                    ST_Multi(ST_GeomFromGeoJSON(%s))::geography
                )
                RETURNING id
            """, (riding_name, province, geometry_json))
        
        result = cursor.fetchone()
        if result:
            print(f'    ✅ Successfully imported (ID: {result[0]})')
            return True
        else:
            print(f'    ⚠️  No rows inserted (might be duplicate or invalid geometry)')
            return False
    except Exception as e:
        print(f'    ❌ Error: {e}')
        return False

def main():
    geojson_path = 'data/geojson/federal-ridings.geojson'
    
    print('Loading GeoJSON file...')
    with open(geojson_path, 'r') as f:
        geojson = json.load(f)
    
    features = geojson.get('features', [])
    
    # Find missing features
    missing_features = []
    for feature in features:
        feduid = feature.get('properties', {}).get('FEDUID', '')
        if feduid in MISSING_FEDUIDS:
            missing_features.append(feature)
    
    print(f'\nFound {len(missing_features)} missing features to import')
    
    if not missing_features:
        print('No missing features found!')
        return
    
    # Connect to database
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password
    )
    cursor = conn.cursor()
    
    imported = 0
    failed = 0
    
    for feature in missing_features:
        if import_feature(cursor, feature):
            imported += 1
            conn.commit()
        else:
            failed += 1
            conn.rollback()
    
    print(f'\n✅ Import completed:')
    print(f'   Imported: {imported}')
    print(f'   Failed: {failed}')
    
    # Verify
    cursor.execute('SELECT COUNT(*) FROM riding_boundaries')
    count = cursor.fetchone()[0]
    print(f'\n📊 Total boundaries in database: {count}')
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()

