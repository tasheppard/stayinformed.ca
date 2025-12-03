#!/usr/bin/env python3
"""
Import Nunavut boundary separately with simplified geometry
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

def main():
    geojson_path = 'data/geojson/federal-ridings.geojson'
    
    print('Loading GeoJSON file...')
    with open(geojson_path, 'r') as f:
        geojson = json.load(f)
    
    features = geojson.get('features', [])
    
    # Find Nunavut feature
    nunavut_feature = None
    for feature in features:
        if feature.get('properties', {}).get('FEDUID') == '62001':
            nunavut_feature = feature
            break
    
    if not nunavut_feature:
        print('Nunavut feature not found!')
        return
    
    props = nunavut_feature.get('properties', {})
    riding_name = props.get('FEDNAME') or props.get('FEDENAME') or 'Nunavut'
    province = 'Nunavut'
    geometry = nunavut_feature.get('geometry', {})
    geometry_json = json.dumps(geometry)
    
    print(f'\nImporting: {riding_name}, {province}')
    print(f'Geometry type: {geometry.get("type")}')
    
    # Connect with longer statement timeout
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password,
        connect_timeout=30
    )
    cursor = conn.cursor()
    
    # Set statement timeout to 5 minutes
    cursor.execute('SET statement_timeout = 300000')  # 5 minutes in milliseconds
    
    try:
        # Try with ST_MakeValid and simplified geometry using ST_Simplify
        print('Attempting import with geometry simplification...')
        cursor.execute("""
            INSERT INTO riding_boundaries (riding_name, province, geom)
            SELECT 
                %s,
                %s,
                ST_MakeValid(
                    ST_Simplify(
                        ST_Transform(
                            ST_SetSRID(
                                ST_GeomFromGeoJSON(%s),
                                3978
                            ),
                            4326
                        ),
                        0.001
                    )
                )::geography
            RETURNING id
        """, (riding_name, province, geometry_json))
        
        result = cursor.fetchone()
        if result:
            print(f'✅ Successfully imported (ID: {result[0]})')
            conn.commit()
        else:
            print('⚠️  No rows inserted')
            conn.rollback()
    except Exception as e:
        print(f'❌ Error: {e}')
        conn.rollback()
        
        # Try without simplification
        print('\nTrying without simplification...')
        try:
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
                RETURNING id
            """, (riding_name, province, geometry_json))
            
            result = cursor.fetchone()
            if result:
                print(f'✅ Successfully imported without simplification (ID: {result[0]})')
                conn.commit()
            else:
                print('⚠️  No rows inserted')
                conn.rollback()
        except Exception as e2:
            print(f'❌ Error without simplification: {e2}')
            conn.rollback()
    
    # Verify
    cursor.execute('SELECT COUNT(*) FROM riding_boundaries')
    count = cursor.fetchone()[0]
    print(f'\n📊 Total boundaries in database: {count}')
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()

