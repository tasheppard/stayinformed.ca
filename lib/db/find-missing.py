#!/usr/bin/env python3
"""
Find missing boundaries by comparing GeoJSON with database
"""
import json
import sys
import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('❌ DATABASE_URL environment variable is not set')
    sys.exit(1)

# Parse DATABASE_URL
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

def main():
    geojson_path = 'data/geojson/federal-ridings.geojson'
    
    print('Loading GeoJSON file...')
    with open(geojson_path, 'r') as f:
        geojson = json.load(f)
    
    features = geojson.get('features', [])
    print(f'\n📋 GeoJSON has {len(features)} features')
    
    # Connect to database
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password
    )
    cursor = conn.cursor()
    
    # Get all riding names from database
    cursor.execute('SELECT riding_name, province FROM riding_boundaries')
    db_ridings = cursor.fetchall()
    db_set = set(f'{r[0]}|{r[1]}' for r in db_ridings)
    print(f'📊 Database has {len(db_set)} boundaries')
    
    # Find missing features
    missing = []
    
    for feature in features:
        props = feature.get('properties', {})
        riding_name = props.get('FEDNAME') or props.get('FEDENAME') or props.get('FEDFNAME') or 'Unknown'
        province_code = props.get('PRUID') or ''
        province = PROVINCE_MAP.get(province_code, 'Unknown')
        feduid = props.get('FEDUID', '')
        
        key = f'{riding_name}|{province}'
        if key not in db_set:
            missing.append({
                'riding_name': riding_name,
                'province': province,
                'province_code': province_code,
                'feduid': feduid
            })
    
    if missing:
        print(f'\n⚠️  Found {len(missing)} missing boundaries:')
        for i, m in enumerate(missing, 1):
            print(f'\n   {i}. {m["riding_name"]}, {m["province"]}')
            print(f'      FEDUID: {m["feduid"]}')
            print(f'      PRUID: {m["province_code"]}')
        
        # Check for similar names
        print(f'\n🔍 Checking for similar names in database...')
        for m in missing:
            cursor.execute("""
                SELECT riding_name, province
                FROM riding_boundaries
                WHERE province = %s
                AND (
                    riding_name ILIKE %s OR
                    riding_name ILIKE %s
                )
            """, (
                m['province'],
                f"%{m['riding_name'].split(' ')[0]}%",
                f"%{m['riding_name'].split('--')[0]}%"
            ))
            similar = cursor.fetchall()
            if similar:
                print(f'\n   "{m["riding_name"]}" might match:')
                for s in similar:
                    print(f'      - {s[0]}')
    else:
        print('\n✅ All features are in the database!')
    
    # Check for duplicates in GeoJSON
    geojson_ridings = {}
    for feature in features:
        props = feature.get('properties', {})
        name = props.get('FEDNAME') or props.get('FEDENAME') or 'Unknown'
        code = props.get('PRUID') or ''
        key = f'{name}|{code}'
        geojson_ridings[key] = geojson_ridings.get(key, 0) + 1
    
    duplicates = {k: v for k, v in geojson_ridings.items() if v > 1}
    if duplicates:
        print(f'\n⚠️  Found {len(duplicates)} duplicate names in GeoJSON:')
        for key, count in duplicates.items():
            print(f'   {key}: {count} times')
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()

