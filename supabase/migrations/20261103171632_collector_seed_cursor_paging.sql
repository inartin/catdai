-- Bound each discovery request to one indexed source and one cursor page.
-- Keep the offset RPC available for older collectors during rollout.
create or replace function public.cadastru_collection_seed_page(
  p_source text, p_after text default null, p_limit integer default 1000
)
returns table(seed_cursor text, source text, lookup_input jsonb, address_text text, building_number text, listing_count bigint)
language sql stable security invoker set search_path = '' as $$
  select s.seed_cursor, s.source, s.lookup_input - 'apartment_number',
    regexp_replace(s.address_text, '[[:space:],;]+(ap(artament(ul)?)?|apt|кв(артира)?)\.?[[:space:]]*[0-9]+[[:space:]]*$', '', 'i'),
    s.building_number, s.listing_count
  from (
    (select b.cadastral_number, 'building'::text, b.lookup_input,
       b.raw_payload->>'address', b.cadastral_number, 0::bigint
     from public.cadastru_buildings b
     where p_source = 'building' and b.cadastral_number > coalesce(p_after, '')
     order by b.cadastral_number
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select n.origin_key, 'nearby', n.lookup_input, null, null, 0
     from public.cadastru_nearby n
     where p_source = 'nearby' and n.origin_key > coalesce(p_after, '')
     order by n.origin_key
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select t.origin_key, 'transport', t.lookup_input, null, null, 0
     from public.cadastru_public_transport t
     where p_source = 'transport' and t.origin_key > coalesce(p_after, '')
     order by t.origin_key
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select r.origin_key, 'reports', r.lookup_input, null, null, 0
     from public.cadastru_municipal_reports r
     where p_source = 'reports' and r.origin_key > coalesce(p_after, '')
     order by r.origin_key
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select e.id::text, 'search', e.search_request, e.search_address, null, 0
     from public.cadastru_search_events e
     where p_source = 'search'
       and e.id >= coalesce(case when p_source = 'search' then p_after::bigint end, '-9223372036854775808'::bigint)
       and e.id::text is distinct from p_after
       and e.search_type = 'address' and e.duplicate_of is null
       and e.result_type in ('address_only','land_only','apartment_only','full_data')
       and nullif(btrim(e.result_value), '') is not null
       and (e.search_request is not null or nullif(btrim(e.search_address), '') is not null)
     order by e.id
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select r.cadastral_number, 'lookup', null,
       coalesce(nullif(r.full_address,''),nullif(r.address_ro,''),nullif(r.address_ru,'')),
       r.shared_building_number, 0
     from public.cadastru_records r
     where p_source = 'lookup' and r.cadastral_number > coalesce(p_after, '')
       and r.lookup_count > 0
       and r.result_type in ('address_only','land_only','apartment_only','full_data')
       and coalesce(r.raw_payload->>'unit_list_entry','false') <> 'true'
       and coalesce(r.source,'') not like '%derived%'
     order by r.cadastral_number
     limit least(greatest(p_limit, 1), 1000))
    union all
    (select l.address_text, 'listing', null, l.address_text, null, count(*)
     from (
       select address_text from public.listing
       where p_source = 'listing' and address_text > coalesce(p_after, '')
       union all
       select address_text from public.listing_rent
       where p_source = 'listing' and address_text > coalesce(p_after, '')
     ) l
     group by l.address_text
     order by l.address_text
     limit least(greatest(p_limit, 1), 1000))
  ) s(seed_cursor, source, lookup_input, address_text, building_number, listing_count)
  order by case when p_source = 'search' then s.seed_cursor::bigint end, s.seed_cursor;
$$;
revoke all on function public.cadastru_collection_seed_page(text,text,integer) from public, anon, authenticated;
grant execute on function public.cadastru_collection_seed_page(text,text,integer) to service_role;
