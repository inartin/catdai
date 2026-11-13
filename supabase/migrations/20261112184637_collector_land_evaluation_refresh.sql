-- Merge the collector's evaluation data only against the snapshot it read.
-- The caller retries a concurrent edit using the current payload.
create or replace function public.merge_cadastru_land_refresh(
  p_table text, p_key text, p_previous jsonb, p_payload jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  key_column text;
  updated integer;
begin
  key_column := case p_table when 'cadastru_records' then 'cadastral_number'
    when 'cadastru_address_aliases' then 'address_key'
    when 'cadastru_buildings' then 'cadastral_number' end;
  if key_column is null or nullif(btrim(p_key), '') is null
    or jsonb_typeof(p_previous) is distinct from 'object'
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid cadastral land refresh';
  end if;
  execute format(
    'update public.%I set raw_payload = $1%s where %I = $2 and raw_payload = $3',
    p_table, case when p_table = 'cadastru_records' then ', payload_hash = null' else '' end, key_column
  ) using p_payload, p_key, p_previous;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.merge_cadastru_land_refresh(text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.merge_cadastru_land_refresh(text,text,jsonb,jsonb) to service_role;
