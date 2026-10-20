-- Apply with credit-consuming requests paused, then deploy the matching app.
-- Snapshot the unused current allowance once; never mint monthly credits again.
begin;
do $$
begin
  if to_regclass('public.user_retained_free_credits') is null then
    create table public.user_retained_free_credits (
      user_id uuid primary key references auth.users(id) on delete cascade,
      remaining_uses integer not null check (remaining_uses between 0 and 1),
      created_at timestamptz not null default now()
    );
    insert into public.user_retained_free_credits(user_id, remaining_uses)
    select u.id, 1 from auth.users u
    where not exists (
      select 1 from public.user_feature_usage_events e
      where e.user_id = u.id and e.source = 'free_monthly'
        and e.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
        and e.created_at < (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC'
    );
  end if;
end $$;
alter table public.user_retained_free_credits enable row level security;
revoke all on public.user_retained_free_credits from public, anon, authenticated;
grant select, update on public.user_retained_free_credits to service_role;

-- Keep the old RPC signature so older app instances cannot replenish an allowance.
create or replace function public.consume_free_monthly_credit(
  p_user_id uuid, p_feature_key text, p_idempotency_key text,
  p_month_start timestamptz, p_month_end timestamptz,
  p_limit integer default 1, p_metadata jsonb default '{}'::jsonb
)
returns table(allowed boolean, usage_event_id uuid, source text, used_count integer, remaining_uses integer, reason text)
language plpgsql security invoker set search_path = public as $$
declare
  previous public.user_feature_usage_events%rowtype;
  usage_id uuid;
begin
  if p_user_id is null or nullif(trim(p_idempotency_key), '') is null
    or p_feature_key is null or p_feature_key not in
      ('sale_estimate','rent_estimate','listing_analysis','cadastru_lookup','yield_calculator','pdf_report') then
    raise exception 'invalid usage request';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('free-monthly-credits'));
  select * into previous from public.user_feature_usage_events e
    where e.user_id = p_user_id and e.feature_key = p_feature_key and e.idempotency_key = p_idempotency_key;
  if found then
    return query select true, previous.id, previous.source, 0, 0, 'already_consumed'::text;
    return;
  end if;
  update public.user_retained_free_credits c set remaining_uses = 0
    where c.user_id = p_user_id and c.remaining_uses = 1;
  if not found then
    return query select false, null::uuid, null::text, 0, 0, 'free_monthly_limit_reached'::text;
    return;
  end if;
  -- Retain the historical source for existing analytics/schema compatibility.
  insert into public.user_feature_usage_events(user_id, feature_key, source, idempotency_key, metadata)
    values(p_user_id, p_feature_key, 'free_monthly', p_idempotency_key,
      coalesce(p_metadata, '{}'::jsonb) || '{"retained_free_credit":true}'::jsonb)
    returning id into usage_id;
  return query select true, usage_id, 'free_monthly'::text, 1, 0, 'consumed'::text;
end $$;
revoke execute on function public.consume_free_monthly_credit(uuid,text,text,timestamptz,timestamptz,integer,jsonb) from public,anon,authenticated;
grant execute on function public.consume_free_monthly_credit(uuid,text,text,timestamptz,timestamptz,integer,jsonb) to service_role;
commit;
