-- Count the inventory once instead of downloading it through OFFSET pages.
-- Keep coverage/address hashing in the application, where its canonical keys are defined.
create function public.admin_cadastru_inventory_stats(p_view text default 'all')
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with buildings as materialized (
    select cadastral_number, regexp_replace(cadastral_number, '[^0-9]', '', 'g') as number,
      lookup_input
    from public.cadastru_buildings
  ), unit_references as materialized (
    -- The existing payload GIN index finds reference markers without opening every JSON payload.
    -- Match JavaScript truthiness, including historical non-boolean values.
    select cadastral_number_digits as number from public.cadastru_records
    where p_view <> 'cities' and raw_payload ? 'unit_list_entry'
      and coalesce(raw_payload -> 'unit_list_entry', 'null'::jsonb)
        not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
  ), record_groups as materialized (
    -- Collapse records into small counting groups during the only inventory scan.
    select r.city, r.cadastral_number_digits in (select number from buildings) as is_building,
      length(r.cadastral_number_digits) in (15, 16) as is_apartment,
      r.shared_building_number is not null as is_linked,
      r.cadastral_number_digits <> '' and r.result_type = 'full_data' as is_full,
      r.result_type in ('full_data', 'apartment_only') or r.apartment_area_m2 is not null or r.apartment_floor is not null as has_details,
      r.next_refresh_after > now() as is_fresh,
      r.cadastral_number_digits in (select number from unit_references) as is_reference,
      count(*) as n
    from public.cadastru_records r
    group by 1, 2, 3, 4, 5, 6, 7, 8
  ), linked_cities as (
    -- Only buildings without a city need a fallback. Use their existing link index.
    select b.cadastral_number as shared_building_number, c.city
    from buildings b
    cross join lateral (
      select r.city from public.cadastru_records r
      where r.shared_building_number = b.cadastral_number and r.city <> ''
      order by r.id desc limit 1
    ) c
    where coalesce(b.lookup_input ->> 'city', '') = ''
  ), inventory as (
    select jsonb_build_object(
      'total', coalesce(sum(n), 0) + (select count(*) from buildings) - coalesce(sum(n) filter (where is_building), 0),
      'fullData', coalesce(sum(n) filter (where is_full and not is_reference), 0),
      'buildings', (select count(*) from buildings),
      'apartments', jsonb_build_object(
        'total', coalesce(sum(n) filter (where not is_building and is_apartment), 0),
        'linked', coalesce(sum(n) filter (where not is_building and is_apartment and is_linked), 0),
        'details', coalesce(sum(n) filter (where not is_building and is_apartment and not is_reference and has_details), 0),
        'references', coalesce(sum(n) filter (where not is_building and is_apartment and (is_reference or not has_details)), 0),
        'fresh', coalesce(sum(n) filter (where not is_building and is_apartment and is_fresh), 0)
      ),
      'other', coalesce(sum(n) filter (where not is_building and not is_apartment), 0)
    ) as counts
    from record_groups
  ), city_inventory as (
    select city, 0 as buildings, case when is_apartment then n else 0 end as apartments,
      case when not is_apartment then n else 0 end as other
    from record_groups where not is_building
    union all
    select coalesce(nullif(b.lookup_input ->> 'city', ''), c.city), 1, 0, 0
    from buildings b left join linked_cities c on c.shared_building_number = b.cadastral_number
  ), city_counts as (
    select coalesce(nullif(regexp_replace(city, '^\s+|\s+$', '', 'g'), ''), 'Unknown city') as city,
      sum(buildings) as buildings, sum(apartments) as apartments, sum(other) as other
    from city_inventory group by 1
  )
  select case when p_view = 'cities' then
    jsonb_build_object('byCity', coalesce((select jsonb_agg(to_jsonb(c)) from city_counts c), '[]'::jsonb))
  else
    (select counts from inventory)
    || jsonb_build_object('linkedCities', coalesce(
      (select jsonb_object_agg(shared_building_number, city) from linked_cities), '{}'::jsonb))
    || case when p_view = 'all' then
      jsonb_build_object('byCity', coalesce((select jsonb_agg(to_jsonb(c)) from city_counts c), '[]'::jsonb))
    else '{}'::jsonb end
  end;
$$;

revoke all on function public.admin_cadastru_inventory_stats(text) from public, anon, authenticated;
grant execute on function public.admin_cadastru_inventory_stats(text) to service_role;
