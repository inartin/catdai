begin;

-- Registered only by the server after validating a real anonymous Supabase session.
create table if not exists public.guest_checkout_accounts (
  guest_user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_user_id uuid references auth.users(id) on delete cascade,
  claimed_at timestamptz,
  check (guest_user_id <> claimed_user_id)
);
alter table public.guest_checkout_accounts enable row level security;
revoke all on public.guest_checkout_accounts from public, anon, authenticated;
grant select, insert, update on public.guest_checkout_accounts to service_role;

-- The API verifies both the registered session and the signed HttpOnly browser proof.
-- This function is invoker-only and cannot be called by browser roles.
create or replace function public.claim_guest_checkout(p_guest_id uuid, p_user_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare claimed uuid; locked_user uuid; table_name text;
begin
  if p_guest_id is null or p_user_id is null or p_guest_id = p_user_id then raise exception 'invalid guest claim'; end if;
  for locked_user in select id from unnest(array[p_guest_id,p_user_id]) id order by id loop
    perform pg_advisory_xact_lock(hashtext(locked_user::text),hashtext('payment-credits'));
  end loop;
  select claimed_user_id into claimed from public.guest_checkout_accounts where guest_user_id=p_guest_id for update;
  if not found or (claimed is not null and claimed<>p_user_id) then raise exception 'guest already claimed or unknown'; end if;

  -- Preserve both historical snapshots on a collision; the target's existing key
  -- already authorizes reopening that request, without another charge.
  update public.user_feature_usage_events guest
    set idempotency_key=guest.idempotency_key || ':guest:' || guest.id::text
    where guest.user_id=p_guest_id and exists (
      select 1 from public.user_feature_usage_events account
      where account.user_id=p_user_id and account.feature_key=guest.feature_key and account.idempotency_key=guest.idempotency_key
    );
  update public.user_feature_usage_events set user_id=p_user_id where user_id=p_guest_id;

  insert into public.user_feature_credits(user_id,feature_key,remaining_uses,total_granted,total_used)
    select p_user_id,feature_key,remaining_uses,total_granted,total_used from public.user_feature_credits where user_id=p_guest_id
    on conflict(user_id,feature_key) do update set
      remaining_uses=user_feature_credits.remaining_uses+excluded.remaining_uses,
      total_granted=user_feature_credits.total_granted+excluded.total_granted,
      total_used=user_feature_credits.total_used+excluded.total_used;
  delete from public.user_feature_credits where user_id=p_guest_id;
  update public.maib_payment_orders set user_id=p_user_id where user_id=p_guest_id;
  update public.maib_credit_grants set user_id=p_user_id where user_id=p_guest_id;
  update public.paddle_payment_orders set user_id=p_user_id where user_id=p_guest_id;
  update public.paddle_subscriptions set user_id=p_user_id where user_id=p_guest_id;
  update public.paddle_subscription_credit_periods set user_id=p_user_id where user_id=p_guest_id;

  -- These history tables are optional in minimal/local databases.
  foreach table_name in array array['estimate_log','cadastru_search_events','calculator_usage_events',
    'listing_link_analysis_events','pdf_generation_events','payment_checkout_events','user_notifications'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('update public.%I set user_id=$1 where user_id=$2',table_name) using p_user_id,p_guest_id;
    end if;
  end loop;
  update public.guest_checkout_accounts set claimed_user_id=p_user_id,claimed_at=coalesce(claimed_at,now()) where guest_user_id=p_guest_id;
end $$;
revoke all on function public.claim_guest_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_guest_checkout(uuid,uuid) to service_role;

-- A guest's single-feature purchase must reach that feature. In particular a PDF
-- or embedded Cadastru purchase must not be consumed by the containing evaluation.
-- After account creation, the existing universal-credit behavior applies.
create or replace function public.consume_user_credit(p_user_id uuid,p_feature_key text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns table(allowed boolean,usage_event_id uuid,source text,remaining_uses integer,reason text)
language plpgsql security invoker set search_path=public as $$
declare old public.user_feature_usage_events%rowtype; grant_order uuid; usage_id uuid; consumed boolean; grant_feature text; guest boolean;
begin
  if p_user_id is null or nullif(trim(p_idempotency_key),'') is null or (p_feature_key is null or p_feature_key not in
    ('sale_estimate','rent_estimate','listing_analysis','cadastru_lookup','yield_calculator','pdf_report')) then raise exception 'invalid usage request'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text),hashtext('payment-credits'));
  guest := exists(select 1 from public.guest_checkout_accounts where guest_user_id=p_user_id);
  select * into old from public.user_feature_usage_events e where e.user_id=p_user_id and e.feature_key=p_feature_key and e.idempotency_key=p_idempotency_key;
  if found then return query select true,old.id,old.source,null::integer,'already_consumed'::text; return; end if;
  select c.feature_key into grant_feature from public.user_feature_credits c
    where c.user_id=p_user_id and c.remaining_uses>0 and (not guest or c.feature_key=p_feature_key)
    order by c.feature_key limit 1 for update;
  update public.user_feature_credits c set remaining_uses=c.remaining_uses-1,total_used=c.total_used+1
    where c.user_id=p_user_id and c.feature_key=grant_feature and c.remaining_uses>0;
  consumed:=found;
  if not consumed then
    select g.order_id,g.feature_key into grant_order,grant_feature from public.maib_credit_grants g
      where g.user_id=p_user_id and g.remaining_uses>0 and not g.overridden and (not guest or g.feature_key=p_feature_key)
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
revoke all on function public.consume_user_credit(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.consume_user_credit(uuid,text,text,jsonb) to service_role;
commit;
