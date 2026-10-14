-- Additive rollout: legacy property payloads remain readable until the app is deployed.
create table public.cadastru_buildings (
  cadastral_number text primary key check (cadastral_number ~ '^[0-9]{7}\.[0-9]{3}\.[0-9]{2}$'),
  raw_payload jsonb not null default '{}'::jsonb,
  lookup_input jsonb,
  field_fetched_at jsonb not null default '{}'::jsonb,
  field_expires_at jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null,
  expires_at timestamptz not null
);
create table public.cadastru_building_addresses (
  origin_key text not null,
  building_number text not null references public.cadastru_buildings(cadastral_number),
  primary key (origin_key, building_number)
);
create index cadastru_building_addresses_number_idx on public.cadastru_building_addresses(building_number);
alter table public.cadastru_records add column shared_building_number text
  references public.cadastru_buildings(cadastral_number);
create index cadastru_records_shared_building_idx on public.cadastru_records(shared_building_number);

create table public.cadastru_municipal_reports (
  origin_key text primary key,
  lookup_input jsonb not null check (jsonb_typeof(lookup_input) = 'object'),
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > fetched_at)
);

alter table public.cadastru_buildings enable row level security;
alter table public.cadastru_building_addresses enable row level security;
alter table public.cadastru_municipal_reports enable row level security;
revoke all on public.cadastru_buildings, public.cadastru_building_addresses, public.cadastru_municipal_reports from public, anon, authenticated;
grant select, insert, update on public.cadastru_buildings, public.cadastru_building_addresses, public.cadastru_municipal_reports to service_role;

-- Serialize concurrent apartment lookups for the same building. Null/missing values
-- never erase known data or renew its dates; older responses cannot replace newer fields.
create function public.merge_cadastru_building(
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
        saved.field_expires_at := saved.field_expires_at || jsonb_build_object(item.key, p_expires_at);
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
