begin;

alter table public.maib_payment_orders add column if not exists ga4_context jsonb;

-- Service-only outbox: bank callbacks and polling atomically enqueue the same
-- verified outcome. Historical orders and sandbox orders have no GA context.
create table if not exists public.ga4_payment_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.maib_payment_orders(id) on delete cascade,
  event_key text not null,
  event_name text not null check (event_name in ('purchase','refund','payment_failed','payment_cancelled')),
  amount_minor integer not null default 0 check (amount_minor >= 0),
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped','unknown')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  sent_at timestamptz,
  last_error text,
  unique (order_id,event_key)
);
create index if not exists ga4_payment_events_pending on public.ga4_payment_events(next_attempt_at)
  where status in ('pending','failed');
alter table public.ga4_payment_events enable row level security;
revoke all on public.ga4_payment_events from public,anon,authenticated;
grant all on public.ga4_payment_events to service_role;
revoke all on sequence public.ga4_payment_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ga4_payment_events_id_seq to service_role;

create or replace function public.queue_ga4_payment_events()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.environment <> 'production' or new.ga4_context is null
    or new.ga4_context->>'analytics_consent' is distinct from 'true' then return new; end if;
  if old.paid_at is null and new.paid_at is not null then
    insert into public.ga4_payment_events(order_id,event_key,event_name,amount_minor,occurred_at)
      values(new.id,'purchase','purchase',new.amount_minor,new.paid_at) on conflict do nothing;
  end if;
  if new.paid_at is not null and new.refunded_minor > old.refunded_minor then
    insert into public.ga4_payment_events(order_id,event_key,event_name,amount_minor)
      values(new.id,'refund:'||new.refunded_minor,'refund',new.refunded_minor-old.refunded_minor) on conflict do nothing;
  end if;
  if new.status in ('failed','canceled') and new.status is distinct from old.status and new.paid_at is null then
    insert into public.ga4_payment_events(order_id,event_key,event_name)
      values(new.id,new.status,case new.status when 'failed' then 'payment_failed' else 'payment_cancelled' end)
      on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_ga4_payment_events() from public,anon,authenticated;
grant execute on function public.queue_ga4_payment_events() to service_role;
drop trigger if exists maib_queue_ga4_payment_events on public.maib_payment_orders;
create trigger maib_queue_ga4_payment_events after update of paid_at,refunded_minor,status
  on public.maib_payment_orders for each row execute function public.queue_ga4_payment_events();

create or replace function public.claim_ga4_payment_events(p_limit integer default 10)
returns setof public.ga4_payment_events language plpgsql security invoker set search_path=public as $$
begin
  -- A stopped sender may already have reached Google. Purchase transaction IDs
  -- deduplicate retries; uncertain refunds must not be blindly resent.
  update public.ga4_payment_events set status=case when event_name='purchase' then 'failed' else 'unknown' end,
    lease_until=null,lease_token=null,last_error='Sender stopped before recording delivery.'
    where status='sending' and lease_until<now();
  return query update public.ga4_payment_events e set status='sending',attempts=e.attempts+1,
    lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),last_error=null
    where e.id in (
      select q.id from public.ga4_payment_events q
      where q.status in ('pending','failed') and q.next_attempt_at<=now()
        -- Refunds must follow their purchase, including when both are discovered together.
        and (q.event_name <> 'refund' or exists (
          select 1 from public.ga4_payment_events p where p.order_id=q.order_id
            and p.event_name='purchase' and p.status in ('sent','skipped')
        ))
      order by q.id limit least(greatest(p_limit,1),10) for update skip locked
    ) returning e.*;
end $$;
revoke all on function public.claim_ga4_payment_events(integer) from public,anon,authenticated;
grant execute on function public.claim_ga4_payment_events(integer) to service_role;
commit;
