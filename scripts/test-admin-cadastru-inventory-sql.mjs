import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { summarizeCadastruCities, summarizeCadastruCoverage, summarizeCadastruStorage } from '../src/lib/admin-cadastru-storage-stats.js';

const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  for (const file of ['db/cadastru_records.sql', 'supabase/migrations/20261013155148_cadastru_shared_buildings.sql',
    'supabase/migrations/20261030195029_admin_cadastru_inventory_stats.sql',
    'supabase/migrations/20261030195445_admin_cadastru_inventory_timeout.sql']) {
    await db.exec(await fs.readFile(file, 'utf8'));
  }
  const read = async view => (await db.query('select public.admin_cadastru_inventory_stats($1) as stats', [view])).rows[0].stats;
  const sortCities = rows => rows.sort((a, b) => (b.buildings + b.apartments + b.other) - (a.buildings + a.apartments + a.other) || a.city.localeCompare(b.city, 'ro'));
  assert.deepEqual(await read('all'), { total: 0, fullData: 0, buildings: 0, apartments: { total: 0, linked: 0, details: 0, references: 0, fresh: 0 }, other: 0, linkedCities: {}, byCity: [] });
  const building = '0100106.131.01';
  const source = {
    buildings: [
      { cadastral_number: building, lookup_input: { city: 'Chișinău' } },
      { cadastral_number: '0100106.132.01', lookup_input: null },
      { cadastral_number: '0100106.133.01', lookup_input: { city: '   ' } },
    ],
    records: [
      { cadastral_number: building, city: 'Bălți', result_type: 'full_data' },
      { cadastral_number: '0100106.131', city: null, result_type: 'land_only' },
      { cadastral_number: '0100106.132.01.001', shared_building_number: '0100106.132.01', city: 'Old city', result_type: 'address_only', apartment_floor: 0 },
      { cadastral_number: '0100106.132.01.002', shared_building_number: '0100106.132.01', city: ' Chișinău ', result_type: 'apartment_only', next_refresh_after: '2000-01-01' },
      { cadastral_number: '0100106.132.01.003', shared_building_number: '0100106.132.01', city: '', result_type: 'address_only', apartment_area_m2: 0 },
      { cadastral_number: '0100106.134.01.001', city: '\t\n', result_type: 'address_only' },
      { cadastral_number: '', city: 'Unknown identity', result_type: 'full_data' },
      ...[undefined, false, null, 0, '', true, 'false', {}, []].map((unit_list_entry, i) => ({
        cadastral_number: `${building}.${String(i + 1).padStart(3, '0')}`, shared_building_number: building,
        city: 'Chișinău', result_type: 'full_data', unit_list_entry, next_refresh_after: '2099-01-01',
      })),
      ...Array.from({ length: 1105 }, (_, i) => ({ cadastral_number: `0100106.999.01.${String(i + 1).padStart(3, '0')}`,
        city: 'Bălți', result_type: 'address_only', unit_list_entry: true })),
    ],
    addresses: [], nearby: [], transport: [], reports: [],
  };
  for (const row of source.buildings) {
    await db.query("insert into public.cadastru_buildings(cadastral_number,lookup_input,fetched_at,expires_at) values ($1,$2,'2000-01-01','2099-01-01')", [row.cadastral_number, row.lookup_input]);
  }
  await db.query(`insert into public.cadastru_records(cadastral_number,city,shared_building_number,result_type,apartment_area_m2,apartment_floor,next_refresh_after,raw_payload)
    select cadastral_number,city,shared_building_number,result_type,apartment_area_m2,apartment_floor,next_refresh_after,raw_payload
    from jsonb_to_recordset($1) as r(cadastral_number text,city text,shared_building_number text,result_type text,
      apartment_area_m2 numeric,apartment_floor integer,next_refresh_after timestamptz,raw_payload jsonb)`,
  [JSON.stringify(source.records.map(row => ({ ...row, raw_payload: row.unit_list_entry === undefined ? {} : { unit_list_entry: row.unit_list_entry } })))]);
  await db.exec(await fs.readFile('supabase/migrations/20261030195134_admin_cadastru_inventory_index.sql', 'utf8'));
  const expected = summarizeCadastruStorage(source);
  const all = await read('all');
  sortCities(all.byCity);
  for (const key of ['total', 'fullData', 'buildings', 'apartments', 'other', 'byCity']) {
    assert.deepEqual(all[key], expected[key], `${key} matches the previous summary across the entire inventory`);
  }
  assert.equal(all.linkedCities['0100106.132.01'], ' Chișinău ', 'last nonempty linked city supplies the building fallback');
  const coverage = summarizeCadastruCoverage({ ...source, linkedCities: all.linkedCities });
  for (const key of ['coverage', 'storedDatasets', 'allCategories', 'collection']) assert.deepEqual(coverage[key], expected[key]);
  const overview = await read('overview');
  assert.equal('byCity' in overview, false, 'overview does not aggregate cities');
  assert.deepEqual(overview.apartments, all.apartments);
  const cities = await read('cities');
  assert.deepEqual(Object.keys(cities), ['byCity'], 'city view returns only its aggregates');
  assert.deepEqual(sortCities(cities.byCity), summarizeCadastruCities(source).byCity);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { allowed } = (await db.query(`select has_function_privilege($1,'public.admin_cadastru_inventory_stats(text)','execute') as allowed`, [role])).rows[0];
    assert.equal(allowed, role === 'service_role', `${role} RPC access`);
  }
  const { prosecdef, proconfig } = (await db.query("select prosecdef,proconfig from pg_proc where oid = 'public.admin_cadastru_inventory_stats(text)'::regprocedure")).rows[0];
  assert.equal(prosecdef, false, 'the aggregate does not bypass row security');
  assert(proconfig.includes('statement_timeout=30s'), 'only the aggregate has a cold-read timeout allowance');
  const regionalMigration=await fs.readFile('supabase/migrations/20261031174629_collector_nationwide_user_seeds.sql','utf8');
  await db.exec(regionalMigration.slice(regionalMigration.lastIndexOf('do $migration$')));
  const beforeRegional=await read('all');
  await db.query("insert into cadastru_records(cadastral_number,city,result_type) values ('0300206.46.01.016','Bălți','full_data')");
  const afterRegional=await read('all');
  assert.equal(afterRegional.apartments.total,beforeRegional.apartments.total+1,'regional parcel width does not hide collected apartments');
  console.log('Inventory SQL: count parity, references, city fallback, expiry, empty inventory, over 1,000 rows and service-only access passed.');
} finally {
  await db.close();
}
