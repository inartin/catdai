-- Source buckets remain intact for refunds, subscriptions and historical grants.
-- Every remaining use is spendable on any supported feature; no balance rewrite.
begin;
create or replace view public.user_credit_balances with (security_invoker=true) as
select user_id,sum(remaining_uses)::integer remaining_uses,
  sum(total_granted)::integer total_granted,sum(total_used)::integer total_used
from public.user_feature_credit_balances group by user_id;
revoke all on public.user_credit_balances from public,anon,authenticated;
grant select on public.user_credit_balances to service_role;

create or replace function public.consume_user_credit(p_user_id uuid,p_feature_key text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns table(allowed boolean,usage_event_id uuid,source text,remaining_uses integer,reason text)
language plpgsql set search_path=public as $$
declare old public.user_feature_usage_events%rowtype; grant_order uuid; usage_id uuid; consumed boolean; grant_feature text;
begin
  if p_user_id is null or nullif(trim(p_idempotency_key),'') is null or (p_feature_key is null or p_feature_key not in
    ('sale_estimate','rent_estimate','listing_analysis','cadastru_lookup','yield_calculator','pdf_report')) then raise exception 'invalid usage request'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text),hashtext('payment-credits'));
  select * into old from public.user_feature_usage_events e where e.user_id=p_user_id and e.feature_key=p_feature_key and e.idempotency_key=p_idempotency_key;
  if found then return query select true,old.id,old.source,null::integer,'already_consumed'::text; return; end if;
  select c.feature_key into grant_feature from public.user_feature_credits c
    where c.user_id=p_user_id and c.remaining_uses>0
    order by c.feature_key limit 1 for update;
  update public.user_feature_credits c set remaining_uses=c.remaining_uses-1,total_used=c.total_used+1
    where c.user_id=p_user_id and c.feature_key=grant_feature and c.remaining_uses>0;
  consumed:=found;
  if not consumed then
    select g.order_id,g.feature_key into grant_order,grant_feature from public.maib_credit_grants g
      where g.user_id=p_user_id and g.remaining_uses>0 and not g.overridden
      order by g.created_at,g.order_id,g.feature_key limit 1 for update;
    if found then
      update public.maib_credit_grants g set remaining_uses=g.remaining_uses-1,total_used=g.total_used+1
        where g.order_id=grant_order and g.feature_key=grant_feature;
      consumed:=true;
    end if;
  end if;
  if not consumed then return query select false,null::uuid,null::text,0,'no_credit'::text; return; end if;
  insert into public.user_feature_usage_events(user_id,feature_key,source,idempotency_key,metadata)
    values(p_user_id,p_feature_key,'paid_credit',p_idempotency_key,
      coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('payment_provider',case when grant_order is null then 'legacy' else 'maib' end,'maib_order_id',grant_order,'credit_grant_feature_key',grant_feature)) returning id into usage_id;
  return query select true,usage_id,'paid_credit'::text,coalesce(b.remaining_uses,0),'consumed'::text
    from public.user_credit_balances b where b.user_id=p_user_id;
end $$;

create or replace function public.consume_free_monthly_credit(
  p_user_id uuid,
  p_feature_key text,
  p_idempotency_key text,
  p_month_start timestamptz,
  p_month_end timestamptz,
  p_limit integer default 1,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  usage_event_id uuid,
  source text,
  used_count integer,
  remaining_uses integer,
  reason text
)
language plpgsql security invoker set search_path=public
as $$
declare
  v_existing public.user_feature_usage_events%rowtype;
  v_usage_id uuid;
  v_used_count integer;
  v_has_existing boolean := false;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_feature_key is null or p_feature_key not in (
    'sale_estimate',
    'rent_estimate',
    'listing_analysis',
    'cadastru_lookup',
    'yield_calculator',
    'pdf_report'
  ) then
    raise exception 'free monthly usage is not supported for feature key: %', p_feature_key;
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    raise exception 'p_idempotency_key is required';
  end if;

  if p_month_start is null or p_month_end is null or p_month_end <= p_month_start then
    raise exception 'valid monthly window is required';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'p_limit must be positive';
  end if;

  p_limit := 1; -- One shared allowance; callers cannot increase it.

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('free-monthly-credits')
  );

  select *
    into v_existing
  from public.user_feature_usage_events usage_events
  where usage_events.user_id = p_user_id
    and usage_events.feature_key = p_feature_key
    and usage_events.idempotency_key = p_idempotency_key;
  if found then
    v_has_existing := true;
  end if;

  select count(*)::integer
    into v_used_count
  from public.user_feature_usage_events usage_events
  where usage_events.user_id = p_user_id
    and usage_events.source = 'free_monthly'
    and usage_events.created_at >= p_month_start
    and usage_events.created_at < p_month_end;

  if v_has_existing then
    allowed := true;
    usage_event_id := v_existing.id;
    source := v_existing.source;
    used_count := v_used_count;
    remaining_uses := greatest(p_limit - v_used_count, 0);
    reason := 'already_consumed';
    return next;
    return;
  end if;

  if v_used_count >= p_limit then
    allowed := false;
    usage_event_id := null;
    source := null;
    used_count := v_used_count;
    remaining_uses := 0;
    reason := 'free_monthly_limit_reached';
    return next;
    return;
  end if;

  insert into public.user_feature_usage_events (
    user_id,
    feature_key,
    source,
    idempotency_key,
    metadata
  ) values (
    p_user_id,
    p_feature_key,
    'free_monthly',
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_usage_id;

  allowed := true;
  usage_event_id := v_usage_id;
  source := 'free_monthly';
  used_count := v_used_count + 1;
  remaining_uses := greatest(p_limit - v_used_count - 1, 0);
  reason := 'consumed';
  return next;
end;
$$;


-- Keep older server callers on the same shared rules during rollout.
create or replace function public.consume_user_feature_credit(p_user_id uuid,p_feature_key text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns table(allowed boolean,usage_event_id uuid,source text,remaining_uses integer,reason text)
language sql security invoker set search_path=public as $$
  select * from public.consume_user_credit(p_user_id,p_feature_key,p_idempotency_key,p_metadata);
$$;
create or replace function public.consume_free_monthly_feature_usage(
  p_user_id uuid,p_feature_key text,p_idempotency_key text,p_month_start timestamptz,
  p_month_end timestamptz,p_limit integer default 1,p_metadata jsonb default '{}'::jsonb)
returns table(allowed boolean,usage_event_id uuid,source text,used_count integer,remaining_uses integer,reason text)
language sql security invoker set search_path=public as $$
  select * from public.consume_free_monthly_credit(p_user_id,p_feature_key,p_idempotency_key,p_month_start,p_month_end,p_limit,p_metadata);
$$;
revoke execute on function public.consume_user_credit(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.consume_user_credit(uuid,text,text,jsonb) to service_role;
revoke execute on function public.consume_free_monthly_credit(uuid,text,text,timestamptz,timestamptz,integer,jsonb) from public,anon,authenticated;
grant execute on function public.consume_free_monthly_credit(uuid,text,text,timestamptz,timestamptz,integer,jsonb) to service_role;
revoke execute on function public.consume_user_feature_credit(uuid,text,text,jsonb) from public,anon,authenticated;
revoke execute on function public.consume_free_monthly_feature_usage(uuid,text,text,timestamptz,timestamptz,integer,jsonb) from public,anon,authenticated;
-- Admin adjustments retain purchase attribution and actual consumption totals.
create or replace function public.adjust_user_credits(p_user_id uuid,p_delta integer)
returns table(remaining_uses integer,total_granted integer,total_used integer)
language plpgsql security invoker set search_path=public as $$
declare r record; outstanding integer; take integer;
begin
  if p_user_id is null or p_delta is null or p_delta=0 or abs(p_delta::bigint)>1000 then
    raise exception 'invalid credit adjustment';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text),hashtext('payment-credits'));
  if p_delta>0 then
    -- Legacy source label is accounting only; credits are universally spendable.
    perform public.grant_user_feature_credits(p_user_id,'sale_estimate',p_delta);
  else
    outstanding := -p_delta;
    for r in select c.feature_key,c.remaining_uses from public.user_feature_credits c
      where c.user_id=p_user_id and c.remaining_uses>0 order by c.feature_key for update
    loop
      take := least(outstanding,r.remaining_uses);
      update public.user_feature_credits c set remaining_uses=c.remaining_uses-take
        where c.user_id=p_user_id and c.feature_key=r.feature_key;
      outstanding := outstanding-take;
      exit when outstanding=0;
    end loop;
    if outstanding>0 then
      for r in select g.order_id,g.feature_key,g.remaining_uses from public.maib_credit_grants g
        where g.user_id=p_user_id and g.remaining_uses>0 and not g.overridden
        order by g.created_at,g.order_id,g.feature_key for update
      loop
        take := least(outstanding,r.remaining_uses);
        update public.maib_credit_grants g set remaining_uses=g.remaining_uses-take
          where g.order_id=r.order_id and g.feature_key=r.feature_key;
        outstanding := outstanding-take;
        exit when outstanding=0;
      end loop;
    end if;
    if outstanding>0 then raise exception 'insufficient credits'; end if;
  end if;
  return query select b.remaining_uses,b.total_granted,b.total_used
    from public.user_credit_balances b where b.user_id=p_user_id;
end $$;
revoke execute on function public.adjust_user_credits(uuid,integer) from public,anon,authenticated;
grant execute on function public.adjust_user_credits(uuid,integer) to service_role;
commit;
