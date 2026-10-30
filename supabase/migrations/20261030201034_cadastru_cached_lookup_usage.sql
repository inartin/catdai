-- A cached read updates usage metadata without rewriting the official snapshot or aliases.
create function public.record_cadastru_lookup_usage(p_number text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  with updated as (
    update public.cadastru_records
      set lookup_count = lookup_count + 1, last_used_at = now()
      where cadastral_number_digits = nullif(regexp_replace(p_number, '[^0-9]', '', 'g'), '')
      returning id
  ) select exists(select 1 from updated);
$$;
revoke all on function public.record_cadastru_lookup_usage(text) from public, anon, authenticated;
grant execute on function public.record_cadastru_lookup_usage(text) to service_role;
