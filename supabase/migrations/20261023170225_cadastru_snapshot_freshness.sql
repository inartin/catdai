-- Preserve source dates; change refresh deadlines, never the age of saved data.
alter table public.cadastru_address_aliases add column if not exists fetched_at timestamptz;
update public.cadastru_address_aliases
  set fetched_at = expires_at - interval '30 days'
  where fetched_at is null;

update public.cadastru_records set next_refresh_after =
  coalesce(last_official_fetch_at, data_updated_at, saved_at) + interval '90 days';
update public.cadastru_address_aliases set expires_at = fetched_at + interval '90 days';
update public.cadastru_nearby set expires_at = fetched_at + interval '90 days';

-- Technical building fields last 180 days. Registry fields retain a 30-day target.
update public.cadastru_buildings b set field_expires_at = (
  select coalesce(jsonb_object_agg(key, value::timestamptz +
    case when key = 'registry' then interval '30 days' else interval '180 days' end), '{}'::jsonb)
  from jsonb_each_text(b.field_fetched_at)
);
update public.cadastru_buildings b set expires_at = coalesce(
  (select min(value::timestamptz) from jsonb_each_text(b.field_expires_at)),
  b.fetched_at + interval '180 days'
);

create or replace function public.merge_cadastru_building(
  p_number text, p_data jsonb, p_fetched_at timestamptz,
  p_expires_at timestamptz, p_lookup_input jsonb
) returns setof public.cadastru_buildings
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.cadastru_buildings;
  item record;
  incoming jsonb;
  preserves_fields boolean;
begin
  if jsonb_typeof(p_data) <> 'object' or p_expires_at <= p_fetched_at then
    raise exception 'Invalid building snapshot';
  end if;
  insert into public.cadastru_buildings(cadastral_number, fetched_at, expires_at)
    values(p_number, p_fetched_at, p_expires_at) on conflict do nothing;
  select * into saved from public.cadastru_buildings where cadastral_number = p_number for update;
  for item in select key, value from jsonb_each(p_data) loop
    if item.value <> 'null'::jsonb and item.value <> '""'::jsonb
      and (saved.field_fetched_at ->> item.key is null
        or (saved.field_fetched_at ->> item.key)::timestamptz <= p_fetched_at) then
      incoming := item.value;
      preserves_fields := false;
      if item.key = 'registry' and jsonb_typeof(incoming) = 'object' then
        incoming := jsonb_strip_nulls(incoming);
        select exists(select 1 from jsonb_object_keys(coalesce(saved.raw_payload -> 'registry', '{}'::jsonb)) k
          where not incoming ? k) into preserves_fields;
        incoming := coalesce(saved.raw_payload -> 'registry', '{}'::jsonb) || incoming;
      end if;
      saved.raw_payload := saved.raw_payload || jsonb_build_object(item.key, incoming);
      if not preserves_fields then
        saved.field_fetched_at := saved.field_fetched_at || jsonb_build_object(item.key, p_fetched_at);
        saved.field_expires_at := saved.field_expires_at || jsonb_build_object(item.key, case when item.key = 'registry' then least(p_expires_at, p_fetched_at + interval '30 days') else p_expires_at end);
      end if;
    end if;
  end loop;
  update public.cadastru_buildings set
    raw_payload = saved.raw_payload,
    field_fetched_at = saved.field_fetched_at,
    field_expires_at = saved.field_expires_at,
    lookup_input = case when p_fetched_at >= saved.fetched_at then coalesce(p_lookup_input, saved.lookup_input) else saved.lookup_input end,
    fetched_at = (select min(value::timestamptz) from jsonb_each_text(saved.field_fetched_at)),
    expires_at = (select min(value::timestamptz) from jsonb_each_text(saved.field_expires_at))
  where cadastral_number = p_number;
  return query select * from public.cadastru_buildings where cadastral_number = p_number;
end;
$$;
revoke all on function public.merge_cadastru_building(text,jsonb,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.merge_cadastru_building(text,jsonb,timestamptz,timestamptz,jsonb) to service_role;

create or replace function public.ingest_cadastru_collection(
  p_bundle jsonb, p_input jsonb, p_origin_key text, p_fetched_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  number text := p_bundle->>'cadastral_number';
  building jsonb := coalesce(p_bundle->'building', '{}'::jsonb);
  unit jsonb;
  incoming jsonb;
  merged jsonb;
  payload jsonb;
  form jsonb;
  saved public.cadastru_records;
  retained boolean;
  detailed boolean;
  expiry timestamptz := p_fetched_at + interval '90 days';
  unit_number text;
  unit_address text;
  observed integer := 0;
  details integer := 0;
  saved_count integer;
begin
  if number is null or number !~ '^[0-9]{7}\.[0-9]{3}\.[0-9]{2}$'
    or jsonb_typeof(building) <> 'object' or jsonb_typeof(p_input) <> 'object'
    or p_origin_key !~ '^[a-f0-9]{64}$' or p_fetched_at is null
    or jsonb_typeof(p_bundle->'apartments') <> 'array' then raise exception 'Invalid collection bundle'; end if;
  if lower(btrim(coalesce(building->>'classifier', ''))) <> 'bloc cu apartamente' then
    if nullif(building->>'classifier', '') is not null or not exists(
      select 1 from public.cadastru_buildings where cadastral_number=number
      and lower(btrim(raw_payload->>'classifier'))='bloc cu apartamente') then
      raise exception 'Apartment block not verified';
    end if;
  end if;
  if jsonb_typeof(p_bundle->'map_location')='object' then
    building := building || jsonb_build_object('map_location', p_bundle->'map_location');
  end if;
  perform public.merge_cadastru_building(number, building, p_fetched_at, p_fetched_at + interval '180 days', p_input);
  insert into public.cadastru_building_addresses(origin_key, building_number)
    values(p_origin_key, number) on conflict do nothing;
  for unit in select value from jsonb_array_elements(p_bundle->'apartments') loop
    unit_number := unit->>'cadastral_number';
    if unit_number is null or unit_number !~ '^[0-9]{7}\.[0-9]{3}\.[0-9]{2}\.[0-9]{3,4}$'
      or regexp_replace(unit_number, '\.[0-9]{3,4}$', '') <> number then
      raise exception 'Apartment parent mismatch';
    end if;
    incoming := coalesce(unit->'apartment', '{}'::jsonb);
    if jsonb_typeof(incoming) <> 'object' then raise exception 'Invalid apartment'; end if;
    select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into incoming
      from jsonb_each(incoming) where value <> 'null'::jsonb and value <> '""'::jsonb;
    insert into public.cadastru_records(cadastral_number, lookup_count)
      values(unit_number, 0) on conflict(cadastral_number) do nothing;
    select * into saved from public.cadastru_records where cadastral_number=unit_number for update;
    -- Do not replace newer interactive data with a delayed collector response.
    if saved.last_official_fetch_at > p_fetched_at then continue; end if;
    select exists(select 1 from jsonb_object_keys(saved.apartment_data) k where not incoming ? k) into retained;
    merged := saved.apartment_data || incoming;
    detailed := exists(select 1 from jsonb_each(merged) where key in
      ('area_m2','floor','toilet','bathroom','is_last_floor','estimated_value_lei','object_type',
       'type','destination','room_usage','ownership_type','transactions_count','real_rights','notes','restrictions')
      and value <> 'null'::jsonb and value <> '""'::jsonb);
    unit_address := coalesce(nullif(merged->>'address',''), saved.full_address);
    form := (saved.form_fields || coalesce(unit->'form_fields','{}'::jsonb)) - 'total_floors' - 'building_type';
    payload := (saved.raw_payload || unit || jsonb_build_object('apartment',merged,'form_fields',form,
      'building_cadastral_number',number, 'source','geodata_wms', 'partial',true))
      - 'building' - 'building_address' - 'map_location' - 'building_bundles' - 'data_freshness';
    if detailed then payload := payload - 'unit_list_entry';
    else payload := payload || '{"unit_list_entry":true}'::jsonb; end if;
    update public.cadastru_records set shared_building_number=number, building_cadastral_number=number,
      full_address=unit_address, address_ro=coalesce(unit_address, address_ro), city=p_input->>'city',
      street=(case p_input->>'road_type' when 'bulevard' then 'bd' when 'strada' then 'str' else p_input->>'road_type' end) || ' ' || (p_input->>'street'),
      house_number=p_input->>'house_number',
      apartment_number=coalesce(substring(unit_address from '(?i)(?:ap\.?|apartament(?:ul)?)\s*([0-9a-zA-Z/-]+)\s*$'), apartment_number),
      apartment_data=merged, building_data='{}', building_total_floors=null, building_construction_year=null,
      form_fields=form, raw_payload=payload, payload_hash=null, partial=true, lookup_source='api', source='geodata_wms',
      apartment_area_m2=case when replace(merged->>'area_m2',',','.') ~ '^[0-9]+(\.[0-9]+)?$' then replace(merged->>'area_m2',',','.')::numeric else apartment_area_m2 end,
      apartment_floor=case when merged->>'floor' ~ '^-?[0-9]+$' then (merged->>'floor')::integer else apartment_floor end,
      apartment_estimated_value_lei=case when replace(merged->>'estimated_value_lei',' ','') ~ '^[0-9]+(\.[0-9]+)?$' then replace(merged->>'estimated_value_lei',' ','')::numeric else apartment_estimated_value_lei end,
      result_type=case when retained then result_type when detailed then 'full_data' else 'address_only' end,
      last_official_fetch_at=case when retained then saved.last_official_fetch_at else p_fetched_at end,
      next_refresh_after=case when retained then saved.next_refresh_after else expiry end,
      data_updated_at=now()
      where cadastral_number=unit_number;
    observed := observed + 1;
    if not coalesce((unit->>'unit_list_entry')::boolean, false) and incoming - 'address' <> '{}'::jsonb then details := details + 1; end if;
  end loop;
  select count(*) into saved_count from public.cadastru_records where shared_building_number=number
    and cadastral_number ~ '\.[0-9]{3,4}$';
  update public.cadastru_buildings set collection_snapshot=jsonb_build_object(
    'fetched_at',p_fetched_at,'observed',observed,'details',details,'inventory_complete',false,
    'usable',observed > 0 and details=observed and building ? 'classifier')
    where cadastral_number=number and (collection_snapshot is null or (collection_snapshot->>'fetched_at')::timestamptz <= p_fetched_at);
  return jsonb_build_object('saved',saved_count,'observed',observed,'details',details,
    'usable',observed > 0 and details=observed and building ? 'classifier');
end;
$$;
revoke all on function public.ingest_cadastru_collection(jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_cadastru_collection(jsonb,jsonb,text,timestamptz) to service_role;
