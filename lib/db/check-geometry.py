#!/usr/bin/env python3
"""
Check geometry validity for missing features
"""
import json
import sys
import os
import psycopg2
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

MISSING_FEDUIDS = ['35082', '35100', '62001']

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
    
    # Connect to database
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password
    )
    cursor = conn.cursor()
    
    for feature in missing_features:
        props = feature.get('properties', {})
        riding_name = props.get('FEDNAME') or props.get('FEDENAME') or 'Unknown'
        geometry = feature.get('geometry', {})
        geometry_json = json.dumps(geometry)
        
        print(f'\n🔍 Checking: {riding_name}')
        print(f'   Geometry type: {geometry.get("type")}')
        
        # Check if geometry is valid after transformation
        cursor.execute("""
            SELECT 
                ST_IsValid(ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(%s),
                        3978
                    ),
                    4326
                )) as is_valid,
                ST_IsValidReason(ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(%s),
                        3978
                    ),
                    4326
                )) as reason
        """, (geometry_json, geometry_json))
        
        result = cursor.fetchone()
        is_valid = result[0]
        reason = result[1]
        
        print(f'   Valid after transform: {is_valid}')
        if not is_valid:
            print(f'   Reason: {reason}')
        
        # Check with ST_Multi
        cursor.execute("""
            SELECT 
                ST_IsValid(ST_Transform(
                    ST_Multi(
                        ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            3978
                        )
                    ),
                    4326
                )) as is_valid,
                ST_IsValidReason(ST_Transform(
                    ST_Multi(
                        ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            3978
                        )
                    ),
                    4326
                )) as reason
        """, (geometry_json, geometry_json))
        
        result2 = cursor.fetchone()
        is_valid_multi = result2[0]
        reason_multi = result2[1]
        
        print(f'   Valid with ST_Multi: {is_valid_multi}')
        if not is_valid_multi:
            print(f'   Reason: {reason_multi}')
        
        # Try without ST_Multi since it's already MultiPolygon
        if geometry.get('type') == 'MultiPolygon':
            cursor.execute("""
                SELECT 
                    ST_IsValid(ST_Transform(
                        ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            3978
                        ),
                        4326
                    )) as is_valid
            """, (geometry_json,))
            result3 = cursor.fetchone()
            print(f'   Valid without ST_Multi: {result3[0]}')
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()

