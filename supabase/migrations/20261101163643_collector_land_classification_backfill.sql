-- Fill only missing land classification fields in an existing snapshot.
-- Row locks preserve concurrent interactive writes and all source timestamps.
create or replace function public.backfill_cadastru_land_classification(
  p_table text, p_key text, p_number text, p_data jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  key_column text;
  saved jsonb;
  merged jsonb;
  item jsonb;
  item_path text[];
  field text;
  value text;
  idx integer;
  changed boolean := false;
begin
  key_column := case p_table when 'cadastru_records' then 'cadastral_number'
    when 'cadastru_address_aliases' then 'address_key'
    when 'cadastru_buildings' then 'cadastral_number' end;
  if key_column is null or p_number is null or p_number !~ '^[0-9]{7}\.[0-9]{1,4}$'
    or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Invalid land classification backfill';
  end if;
  execute format('select raw_payload from public.%I where %I = $1 for update', p_table, key_column)
    into saved using p_key;
  if saved is null then return jsonb_build_object('changed', false, 'payload', null); end if;
  merged := saved;
  -- -1 addresses the root of standalone land records; all other paths are
  -- explicit land entries. A building/apartment suffix is never land identity.
  for idx in -1..(case when jsonb_typeof(saved->'lands') = 'array'
    then jsonb_array_length(saved->'lands') else 0 end - 1) loop
    item_path := case when idx = -1 then array[]::text[] else array['lands', idx::text] end;
    item := case when idx = -1 then merged else merged #> item_path end;
    if item->>'cadastral_number' is distinct from p_number then continue; end if;
    foreach field in array array['use_mode', 'destination'] loop
      value := case when jsonb_typeof(p_data->field) = 'string' then nullif(btrim(p_data->>field), '') end;
      if value is not null and nullif(btrim(item->>field), '') is null then
        merged := jsonb_set(merged, item_path || field, to_jsonb(value), true);
        changed := true;
      end if;
    end loop;
  end loop;
  if changed then
    execute format('update public.%I set raw_payload = $1%s where %I = $2', p_table,
      case when p_table = 'cadastru_records' then ', payload_hash = null' else '' end, key_column)
      using merged, p_key;
  end if;
  return jsonb_build_object('changed', changed, 'payload', merged);
end;
$$;
revoke all on function public.backfill_cadastru_land_classification(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.backfill_cadastru_land_classification(text,text,text,jsonb) to service_role;
