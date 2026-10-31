-- Building candidates only; no user identifiers, valuation criteria or unit fields.
create or replace function public.cadastru_collection_seeds(p_offset integer default 0, p_limit integer default 500)
returns table(source text, lookup_input jsonb, address_text text, building_number text, listing_count bigint)
language sql stable security invoker set search_path = '' as $$
  select s.source, s.lookup_input - 'apartment_number',
    regexp_replace(s.address_text, '[[:space:],;]+(ap(artament(ul)?)?|apt|кв(артира)?)\.?[[:space:]]*[0-9]+[[:space:]]*$', '', 'i'),
    s.building_number, s.listing_count
  from (
    select 'building'::text, b.lookup_input, b.raw_payload->>'address', b.cadastral_number, 0::bigint
      from public.cadastru_buildings b
    union all
    select 'nearby', n.lookup_input, null, null, 0 from public.cadastru_nearby n
    union all
    select 'transport', t.lookup_input, null, null, 0 from public.cadastru_public_transport t
    union all
    select 'reports', r.lookup_input, null, null, 0 from public.cadastru_municipal_reports r
    union all
    select 'search', e.search_request, e.search_address, null, 0
      from public.cadastru_search_events e
      where e.search_type='address' and e.duplicate_of is null
        and e.result_type in ('address_only','land_only','apartment_only','full_data')
        and nullif(btrim(e.result_value), '') is not null
        and (e.search_request is not null or nullif(btrim(e.search_address), '') is not null)
    union all
    -- Includes successful Cadastru shortcuts used in sale/rent evaluations.
    -- Collector-generated unit references have lookup_count=0 and are excluded.
    select 'lookup', null, coalesce(nullif(r.full_address,''),nullif(r.address_ro,''),nullif(r.address_ru,'')),
      r.shared_building_number, 0
      from public.cadastru_records r
      where r.lookup_count > 0 and r.result_type in ('address_only','land_only','apartment_only','full_data')
        and coalesce(r.raw_payload->>'unit_list_entry','false') <> 'true'
        and coalesce(r.source,'') not like '%derived%'
    union all
    select 'listing', null, l.address_text, null, count(*) from (
      select address_text from public.listing where address_text is not null
      union all
      select address_text from public.listing_rent where address_text is not null
    ) l group by l.address_text
  ) s(source,lookup_input,address_text,building_number,listing_count)
  order by s.source, s.building_number nulls last, s.address_text nulls last, s.lookup_input::text
  limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0);
$$;
revoke all on function public.cadastru_collection_seeds(integer,integer) from public, anon, authenticated;
grant execute on function public.cadastru_collection_seeds(integer,integer) to service_role;

-- Official parcel segments have 1-4 digits outside the Chișinău convention.
alter table public.cadastru_buildings drop constraint cadastru_buildings_cadastral_number_check;
alter table public.cadastru_buildings add constraint cadastru_buildings_cadastral_number_check
  check (cadastral_number ~ '^[0-9]{7}\.[0-9]{1,4}\.[0-9]{2}$');

-- Retain the installed ingestion/freshness behavior; widen only its parcel patterns.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.ingest_cadastru_collection(jsonb,jsonb,text,timestamptz)'::regprocedure);
  execute replace(definition, '[0-9]{3}', '[0-9]{1,4}');
end;
$migration$;

-- Keep the existing inventory RPC accurate for regional unit identifiers too.
do $migration$
declare definition text;
begin
  if to_regprocedure('public.admin_cadastru_inventory_stats(text)') is not null then
    definition := pg_get_functiondef('public.admin_cadastru_inventory_stats(text)'::regprocedure);
    execute replace(definition, 'length(r.cadastral_number_digits) in (15, 16) as is_apartment',
      '(length(r.cadastral_number_digits) in (15, 16) or r.cadastral_number ~ ''^[0-9]{7}[.][0-9]{1,4}[.][0-9]{2}[.][0-9]{3,4}$'') as is_apartment');
  end if;
end;
$migration$;
