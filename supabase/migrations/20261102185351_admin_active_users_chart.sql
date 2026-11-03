-- Aggregate only identities/timestamps in Postgres; no auth accounts or event
-- payloads leave the database. Definer access is needed for private auth metadata,
-- matching admin_active_user_stats. Only the server's service role may execute it.
create function public.admin_active_users_chart(p_since timestamptz, p_until timestamptz, p_hourly boolean default false)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with events as (
    select user_id, coalesce(visitor->>'device_id', device_id) as device_id, visitor, created_at from public.estimate_log
    union all
    select user_id, visitor->>'device_id', visitor, created_at from public.cadastru_search_events where duplicate_of is null
    union all
    select user_id, visitor->>'device_id', visitor, created_at from public.external_api_usage_events
    union all
    select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.pdf_generation_events
    union all
    select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.calculator_usage_events
    union all
    select user_id, visitor->>'device_id', visitor, created_at from public.listing_link_analysis_events
    union all
    select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.payment_checkout_events
    union all
    select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.ad_source_events
    union all
    select user_id, visitor->>'device_id', visitor, last_seen_at from public.user_activity
    union all
    select user_id, device_id::text, null::jsonb, last_seen_at from public.visitor_activity
  ), visits as materialized (
    select date_trunc(case when p_hourly then 'hour' else 'day' end,
        e.created_at at time zone 'Europe/Chisinau') as bucket,
      case when not coalesce(u.is_anonymous, false) then u.id end as user_id,
      u.created_at as registered_at,
      case when e.device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then e.device_id::uuid end as device_id
    from events e
    left join auth.users u on u.id = e.user_id
    where (p_since is null or e.created_at >= p_since)
      and e.created_at < coalesce(p_until, now())
      and e.visitor->>'device_type' is distinct from 'Bot'
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
    union
    -- Registrations count as activity, even before a first heartbeat.
    select date_trunc(case when p_hourly then 'hour' else 'day' end,
        u.created_at at time zone 'Europe/Chisinau'), u.id, u.created_at, null::uuid
    from auth.users u
    where not coalesce(u.is_anonymous, false)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
      and (p_since is null or u.created_at >= p_since)
      and u.created_at < coalesce(p_until, now())
  ), registered as materialized (
    select distinct bucket, user_id, registered_at from visits where user_id is not null
  ), anonymous as (
    select distinct v.bucket, v.device_id
    from visits v
    where v.user_id is null and v.device_id is not null
      and not exists (select 1 from visits s where s.bucket = v.bucket
        and s.user_id is not null and s.device_id = v.device_id)
  ), registered_counts as (
    select bucket, count(*) as total,
      count(*) filter (where date_trunc(case when p_hourly then 'hour' else 'day' end,
        registered_at at time zone 'Europe/Chisinau') = bucket) as new_users
    from registered group by bucket
  ), anonymous_counts as (
    select bucket, count(*) as total from anonymous group by bucket
  ), bounds as (
    select case when p_hourly then date_trunc('day', p_since at time zone 'Europe/Chisinau')
      else coalesce(date_trunc('day', p_since at time zone 'Europe/Chisinau'),
        (select min(bucket) from visits), date_trunc('day', now() at time zone 'Europe/Chisinau')) end as first_bucket,
      case when p_hourly then date_trunc('day', p_since at time zone 'Europe/Chisinau') + interval '23 hours'
      else date_trunc('day', (coalesce(p_until - interval '1 microsecond', now())) at time zone 'Europe/Chisinau') end as last_bucket
  ), buckets as (
    select generate_series(first_bucket, last_bucket,
      case when p_hourly then interval '1 hour' else interval '1 day' end) as bucket from bounds
  ), points as (
    select b.bucket, jsonb_build_object(
      'date', to_char(b.bucket, case when p_hourly then 'HH24:00' else 'YYYY-MM-DD' end),
      'activeUsers', coalesce(r.total, 0) + coalesce(a.total, 0),
      'newUsers', coalesce(r.new_users, 0),
      'oldUsers', coalesce(r.total - r.new_users, 0),
      'anonymousUsers', coalesce(a.total, 0)) as point
    from buckets b
    left join registered_counts r using (bucket)
    left join anonymous_counts a using (bucket)
  ), period_registered as (
    select distinct user_id, registered_at from registered
  ), period_anonymous as (
    select distinct v.device_id from visits v
    where v.user_id is null and v.device_id is not null
      and not exists (select 1 from visits s where s.user_id is not null and s.device_id = v.device_id)
  )
  select jsonb_build_object(
    'activeUsers', (select count(*) from period_registered) + (select count(*) from period_anonymous),
    'newUsers', (select count(*) from period_registered where p_since is null or registered_at >= p_since),
    'oldUsers', (select count(*) from period_registered where p_since is not null and registered_at < p_since),
    'dailyActiveUsers', coalesce((select jsonb_agg(point order by bucket) from points), '[]'::jsonb));
$$;
revoke all on function public.admin_active_users_chart(timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.admin_active_users_chart(timestamptz, timestamptz, boolean) to service_role;
