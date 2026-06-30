-- ============================================================
-- Paddle payments schema
-- Run this in Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.touch_paddle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- paddle_payment_orders - one Paddle checkout transaction
-- ============================================================

create table if not exists public.paddle_payment_orders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete set null,
  product_key           text not null,
  status                text not null default 'pending',
  paddle_price_id       text not null,
  paddle_transaction_id text unique,
  paddle_subscription_id text,
  paddle_customer_id    text,
  paddle_checkout_url   text,
  amount_minor          integer,
  currency_code         text,
  paid_at               timestamptz,
  credit_grants         jsonb not null default '{}'::jsonb,
  language              text,
  customer_snapshot     jsonb not null default '{}'::jsonb,
  request_payload       jsonb not null default '{}'::jsonb,
  response_payload      jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint paddle_payment_orders_product_check
    check (product_key in (
      'standard_pack',
      'pro_pack',
      'extra_pack',
      'sale_estimate_single',
      'rent_estimate_single',
      'listing_analysis_single',
      'cadastru_lookup_single',
      'yield_calculator_single',
      'pdf_report_single'
    )),
  constraint paddle_payment_orders_status_check
    check (status in ('pending', 'registered', 'checkout_closed', 'paid', 'canceled', 'payment_failed', 'failed')),
  constraint paddle_payment_orders_amount_check
    check (amount_minor is null or amount_minor >= 0),
  constraint paddle_payment_orders_currency_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint paddle_payment_orders_language_check
    check (language is null or language in ('ro', 'ru', 'en')),
  constraint paddle_payment_orders_price_check
    check (
      paddle_price_id ~ '^pri_[A-Za-z0-9]+$'
    ),
  constraint paddle_payment_orders_transaction_check
    check (paddle_transaction_id is null or paddle_transaction_id ~ '^txn_[A-Za-z0-9]+$'),
  constraint paddle_payment_orders_subscription_check
    check (paddle_subscription_id is null or paddle_subscription_id ~ '^sub_[A-Za-z0-9]+$')
);

create index if not exists idx_paddle_payment_orders_user_created
  on public.paddle_payment_orders (user_id, created_at desc);

create index if not exists idx_paddle_payment_orders_status_created
  on public.paddle_payment_orders (status, created_at desc);

create index if not exists idx_paddle_payment_orders_transaction
  on public.paddle_payment_orders (paddle_transaction_id);

do $$
begin
  alter table public.paddle_payment_orders
    add column if not exists paddle_subscription_id text;

  alter table public.paddle_payment_orders
    drop constraint if exists paddle_payment_orders_subscription_check;
  alter table public.paddle_payment_orders
    add constraint paddle_payment_orders_subscription_check
    check (paddle_subscription_id is null or paddle_subscription_id ~ '^sub_[A-Za-z0-9]+$');
end $$;

create index if not exists idx_paddle_payment_orders_subscription
  on public.paddle_payment_orders (paddle_subscription_id);

-- ============================================================
-- payment_checkout_events - checkout popup/page analytics
-- ============================================================

create table if not exists public.payment_checkout_events (
  id                    bigserial primary key,
  event_type            text not null,
  user_id               uuid references auth.users(id) on delete set null,
  device_id             text,
  session_id            text,
  order_id              uuid references public.paddle_payment_orders(id) on delete set null,
  paddle_transaction_id text,
  product_key           text,
  source_product_key    text,
  path                  text,
  referrer              text,
  created_at            timestamptz not null default now(),

  constraint payment_checkout_events_type_check
    check (event_type in ('checkout_popup_opened', 'checkout_page_opened', 'pricing_page_opened')),
  constraint payment_checkout_events_transaction_check
    check (paddle_transaction_id is null or paddle_transaction_id ~ '^txn_[A-Za-z0-9]+$')
);

do $$
begin
  alter table public.payment_checkout_events
    drop constraint if exists payment_checkout_events_type_check;
  alter table public.payment_checkout_events
    drop constraint if exists payment_checkout_events_event_type_check;
  alter table public.payment_checkout_events
    add constraint payment_checkout_events_type_check
    check (event_type in (
      'checkout_popup_opened',
      'checkout_page_opened',
      'pricing_page_opened'
    ));
end $$;

create index if not exists idx_payment_checkout_events_created
  on public.payment_checkout_events (created_at desc);

create index if not exists idx_payment_checkout_events_type_created
  on public.payment_checkout_events (event_type, created_at desc);

create index if not exists idx_payment_checkout_events_user_created
  on public.payment_checkout_events (user_id, created_at desc);

create index if not exists idx_payment_checkout_events_session
  on public.payment_checkout_events (session_id);

-- ============================================================
-- paddle_subscriptions - current subscription state from Paddle
-- ============================================================

create table if not exists public.paddle_subscriptions (
  paddle_subscription_id text primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  product_key            text not null,
  paddle_customer_id     text,
  paddle_price_id        text,
  status                 text not null,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  last_transaction_id    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint paddle_subscriptions_id_check
    check (paddle_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  constraint paddle_subscriptions_product_check
    check (product_key in ('extra_pack')),
  constraint paddle_subscriptions_status_check
    check (status in ('active', 'trialing', 'past_due', 'paused', 'canceled')),
  constraint paddle_subscriptions_transaction_check
    check (last_transaction_id is null or last_transaction_id ~ '^txn_[A-Za-z0-9]+$'),
  constraint paddle_subscriptions_price_check
    check (paddle_price_id is null or paddle_price_id ~ '^pri_[A-Za-z0-9]+$')
);

create index if not exists idx_paddle_subscriptions_user
  on public.paddle_subscriptions (user_id, updated_at desc);

drop trigger if exists trg_paddle_subscriptions_updated_at on public.paddle_subscriptions;
create trigger trg_paddle_subscriptions_updated_at
before update on public.paddle_subscriptions
for each row execute function public.touch_paddle_updated_at();

-- ============================================================
-- paddle_subscription_credit_periods - idempotent monthly resets
-- ============================================================

create table if not exists public.paddle_subscription_credit_periods (
  id                       uuid primary key default gen_random_uuid(),
  paddle_subscription_id   text not null references public.paddle_subscriptions(paddle_subscription_id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  product_key              text not null,
  paddle_transaction_id    text not null,
  billing_period_start     timestamptz not null,
  billing_period_end       timestamptz not null,
  credit_grants            jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),

  constraint paddle_subscription_credit_periods_product_check
    check (product_key in ('extra_pack')),
  constraint paddle_subscription_credit_periods_transaction_check
    check (paddle_transaction_id ~ '^txn_[A-Za-z0-9]+$'),
  constraint paddle_subscription_credit_periods_period_check
    check (billing_period_end > billing_period_start),
  constraint paddle_subscription_credit_periods_unique_period
    unique (paddle_subscription_id, billing_period_start, billing_period_end),
  constraint paddle_subscription_credit_periods_unique_transaction
    unique (paddle_transaction_id)
);

create index if not exists idx_paddle_subscription_credit_periods_user_created
  on public.paddle_subscription_credit_periods (user_id, created_at desc);

do $$
begin
  alter table public.paddle_payment_orders
    drop constraint if exists paddle_payment_orders_product_check;
  alter table public.paddle_payment_orders
    add constraint paddle_payment_orders_product_check
    check (product_key in (
      'standard_pack',
      'pro_pack',
      'extra_pack',
      'sale_estimate_single',
      'rent_estimate_single',
      'listing_analysis_single',
      'cadastru_lookup_single',
      'yield_calculator_single',
      'pdf_report_single'
    ));
end $$;

do $$
begin
  alter table public.paddle_payment_orders
    drop constraint if exists paddle_payment_orders_status_check;
  alter table public.paddle_payment_orders
    add constraint paddle_payment_orders_status_check
    check (status in (
      'pending',
      'registered',
      'checkout_closed',
      'paid',
      'canceled',
      'payment_failed',
      'failed'
    ));
end $$;

do $$
begin
  alter table public.paddle_payment_orders
    drop constraint if exists paddle_payment_orders_price_check;
  alter table public.paddle_payment_orders
    add constraint paddle_payment_orders_price_check
    check (
      paddle_price_id ~ '^pri_[A-Za-z0-9]+$'
    );
end $$;

drop trigger if exists trg_paddle_payment_orders_updated_at on public.paddle_payment_orders;
create trigger trg_paddle_payment_orders_updated_at
before update on public.paddle_payment_orders
for each row execute function public.touch_paddle_updated_at();

-- ============================================================
-- paddle_webhook_events - raw Paddle webhook audit and idempotency
-- ============================================================

create table if not exists public.paddle_webhook_events (
  id                    bigserial primary key,
  event_id              text unique,
  event_type            text,
  notification_id       text,
  occurred_at           timestamptz,
  order_id              uuid references public.paddle_payment_orders(id) on delete set null,
  paddle_transaction_id text,
  paddle_subscription_id text,
  signature_header      text,
  signature_valid       boolean not null default false,
  payload               jsonb not null default '{}'::jsonb,
  processed_at          timestamptz,
  processing_error      text,
  created_at            timestamptz not null default now(),

  constraint paddle_webhook_events_transaction_check
    check (paddle_transaction_id is null or paddle_transaction_id ~ '^txn_[A-Za-z0-9]+$'),
  constraint paddle_webhook_events_subscription_check
    check (paddle_subscription_id is null or paddle_subscription_id ~ '^sub_[A-Za-z0-9]+$')
);

do $$
begin
  alter table public.paddle_webhook_events
    add column if not exists paddle_subscription_id text;

  alter table public.paddle_webhook_events
    drop constraint if exists paddle_webhook_events_subscription_check;
  alter table public.paddle_webhook_events
    add constraint paddle_webhook_events_subscription_check
    check (paddle_subscription_id is null or paddle_subscription_id ~ '^sub_[A-Za-z0-9]+$');
end $$;

create index if not exists idx_paddle_webhook_events_order_created
  on public.paddle_webhook_events (order_id, created_at desc);

create index if not exists idx_paddle_webhook_events_transaction_created
  on public.paddle_webhook_events (paddle_transaction_id, created_at desc);

create index if not exists idx_paddle_webhook_events_subscription_created
  on public.paddle_webhook_events (paddle_subscription_id, created_at desc);

create index if not exists idx_paddle_webhook_events_signature_created
  on public.paddle_webhook_events (signature_valid, created_at desc);

-- ============================================================
-- RPC helpers for Paddle payment grants
-- ============================================================

create or replace function public.grant_paddle_payment_order_feature_credits(
  p_order_id uuid,
  p_feature_key text,
  p_uses_count integer
)
returns table (
  granted boolean,
  remaining_uses integer
)
language plpgsql
as $$
declare
  v_order public.paddle_payment_orders%rowtype;
  v_remaining_uses integer;
begin
  if p_feature_key not in (
    'sale_estimate',
    'rent_estimate',
    'listing_analysis',
    'cadastru_lookup',
    'yield_calculator',
    'pdf_report'
  ) then
    raise exception 'unknown feature key: %', p_feature_key;
  end if;

  if p_uses_count <= 0 then
    raise exception 'p_uses_count must be positive';
  end if;

  select *
    into v_order
  from public.paddle_payment_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'paddle payment order not found: %', p_order_id;
  end if;

  if v_order.status <> 'paid' then
    raise exception 'paddle payment order % is not paid', p_order_id;
  end if;

  if v_order.user_id is null then
    raise exception 'paddle payment order % has no user_id', p_order_id;
  end if;

  if v_order.credit_grants ? p_feature_key then
    select credits.remaining_uses
      into v_remaining_uses
    from public.user_feature_credits credits
    where credits.user_id = v_order.user_id
      and credits.feature_key = p_feature_key;

    granted := false;
    remaining_uses := coalesce(v_remaining_uses, 0);
    return next;
    return;
  end if;

  perform public.grant_user_feature_credits(v_order.user_id, p_feature_key, p_uses_count);

  update public.paddle_payment_orders
  set credit_grants = credit_grants || jsonb_build_object(p_feature_key, p_uses_count)
  where id = v_order.id;

  select credits.remaining_uses
    into v_remaining_uses
  from public.user_feature_credits credits
  where credits.user_id = v_order.user_id
    and credits.feature_key = p_feature_key;

  granted := true;
  remaining_uses := coalesce(v_remaining_uses, 0);
  return next;
end;
$$;

create or replace function public.reset_paddle_subscription_period_feature_credits(
  p_subscription_id text,
  p_user_id uuid,
  p_product_key text,
  p_paddle_transaction_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credit_grants jsonb
)
returns table (
  reset_applied boolean
)
language plpgsql
as $$
declare
  v_period_id uuid;
  v_feature_key text;
  v_uses_text text;
  v_uses_count integer;
begin
  if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'p_subscription_id is invalid';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_product_key <> 'extra_pack' then
    raise exception 'unsupported subscription product: %', p_product_key;
  end if;

  if p_paddle_transaction_id is null or p_paddle_transaction_id !~ '^txn_[A-Za-z0-9]+$' then
    raise exception 'p_paddle_transaction_id is invalid';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'billing period is invalid';
  end if;

  if p_credit_grants is null or jsonb_typeof(p_credit_grants) <> 'object' then
    raise exception 'p_credit_grants must be an object';
  end if;

  insert into public.paddle_subscription_credit_periods (
    paddle_subscription_id,
    user_id,
    product_key,
    paddle_transaction_id,
    billing_period_start,
    billing_period_end,
    credit_grants
  ) values (
    p_subscription_id,
    p_user_id,
    p_product_key,
    p_paddle_transaction_id,
    p_period_start,
    p_period_end,
    p_credit_grants
  )
  on conflict do nothing
  returning id into v_period_id;

  if v_period_id is null then
    reset_applied := false;
    return next;
    return;
  end if;

  for v_feature_key, v_uses_text in
    select key, value from jsonb_each_text(p_credit_grants)
  loop
    if v_feature_key not in (
      'sale_estimate',
      'rent_estimate',
      'listing_analysis',
      'cadastru_lookup',
      'yield_calculator',
      'pdf_report'
    ) then
      raise exception 'unknown feature key: %', v_feature_key;
    end if;

    v_uses_count := v_uses_text::integer;
    if v_uses_count <= 0 then
      raise exception 'uses count must be positive for %', v_feature_key;
    end if;

    insert into public.user_feature_credits (
      user_id,
      feature_key,
      remaining_uses,
      total_granted,
      total_used
    ) values (
      p_user_id,
      v_feature_key,
      v_uses_count,
      v_uses_count,
      0
    )
    on conflict (user_id, feature_key) do update set
      remaining_uses = excluded.remaining_uses,
      total_granted = excluded.total_granted,
      total_used = 0;
  end loop;

  update public.paddle_subscriptions
  set
    current_period_start = p_period_start,
    current_period_end = p_period_end,
    last_transaction_id = p_paddle_transaction_id
  where paddle_subscription_id = p_subscription_id;

  reset_applied := true;
  return next;
end;
$$;

create or replace function public.clear_paddle_subscription_feature_credits(
  p_subscription_id text
)
returns table (
  cleared boolean
)
language plpgsql
as $$
declare
  v_subscription public.paddle_subscriptions%rowtype;
begin
  if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'p_subscription_id is invalid';
  end if;

  select *
    into v_subscription
  from public.paddle_subscriptions
  where paddle_subscription_id = p_subscription_id
  for update;

  if not found then
    cleared := false;
    return next;
    return;
  end if;

  if v_subscription.product_key <> 'extra_pack' then
    raise exception 'unsupported subscription product: %', v_subscription.product_key;
  end if;

  delete from public.user_feature_credits
  where user_id = v_subscription.user_id
    and feature_key in (
      'sale_estimate',
      'rent_estimate',
      'listing_analysis',
      'cadastru_lookup',
      'yield_calculator',
      'pdf_report'
    );

  cleared := true;
  return next;
end;
$$;

create or replace function public.complete_paddle_payment(
  p_order_id uuid,
  p_paddle_transaction_id text,
  p_paddle_customer_id text default null,
  p_amount_minor integer default null,
  p_currency_code text default null,
  p_payload jsonb default '{}'::jsonb,
  p_paid_at timestamptz default now()
)
returns table (
  order_id uuid,
  product_key text
)
language plpgsql
as $$
declare
  v_order public.paddle_payment_orders%rowtype;
begin
  if p_order_id is null then
    raise exception 'p_order_id is required';
  end if;

  if length(trim(coalesce(p_paddle_transaction_id, ''))) = 0 then
    raise exception 'p_paddle_transaction_id is required';
  end if;

  select *
    into v_order
  from public.paddle_payment_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'paddle payment order not found: %', p_order_id;
  end if;

  if v_order.user_id is null then
    raise exception 'paddle payment order % has no user_id', v_order.id;
  end if;

  if v_order.paddle_transaction_id is not null
     and v_order.paddle_transaction_id <> p_paddle_transaction_id then
    raise exception 'paddle transaction id mismatch for order %', p_order_id;
  end if;

  update public.paddle_payment_orders
  set
    status = 'paid',
    paddle_transaction_id = coalesce(paddle_transaction_id, p_paddle_transaction_id),
    paddle_customer_id = coalesce(p_paddle_customer_id, paddle_customer_id),
    amount_minor = coalesce(p_amount_minor, amount_minor),
    currency_code = coalesce(p_currency_code, currency_code),
    paid_at = coalesce(paid_at, p_paid_at, now()),
    response_payload = coalesce(response_payload, '{}'::jsonb)
      || jsonb_build_object('completed_webhook', coalesce(p_payload, '{}'::jsonb))
  where id = v_order.id
  returning * into v_order;

  order_id := v_order.id;
  product_key := v_order.product_key;
  return next;
end;
$$;

-- ============================================================
-- Access: payment and webhook tables are server-owned.
-- API routes should use SUPABASE_SERVICE_KEY and enforce user auth.
-- ============================================================

alter table public.paddle_payment_orders enable row level security;
alter table public.paddle_webhook_events enable row level security;
alter table public.payment_checkout_events enable row level security;
alter table public.paddle_subscriptions enable row level security;
alter table public.paddle_subscription_credit_periods enable row level security;

revoke all on public.paddle_payment_orders from anon, authenticated;
revoke all on public.paddle_webhook_events from anon, authenticated;
revoke all on public.payment_checkout_events from anon, authenticated;
revoke all on public.paddle_subscriptions from anon, authenticated;
revoke all on public.paddle_subscription_credit_periods from anon, authenticated;

grant all on public.paddle_payment_orders to service_role;
grant all on public.paddle_webhook_events to service_role;
grant all on public.payment_checkout_events to service_role;
grant all on public.paddle_subscriptions to service_role;
grant all on public.paddle_subscription_credit_periods to service_role;
grant usage, select on sequence public.paddle_webhook_events_id_seq to service_role;
grant usage, select on sequence public.payment_checkout_events_id_seq to service_role;

revoke execute on function public.grant_paddle_payment_order_feature_credits(uuid, text, integer) from public;
revoke execute on function public.reset_paddle_subscription_period_feature_credits(text, uuid, text, text, timestamptz, timestamptz, jsonb) from public;
revoke execute on function public.clear_paddle_subscription_feature_credits(text) from public;
revoke execute on function public.complete_paddle_payment(uuid, text, text, integer, text, jsonb, timestamptz) from public;

grant execute on function public.grant_paddle_payment_order_feature_credits(uuid, text, integer) to service_role;
grant execute on function public.reset_paddle_subscription_period_feature_credits(text, uuid, text, text, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.clear_paddle_subscription_feature_credits(text) to service_role;
grant execute on function public.complete_paddle_payment(uuid, text, text, integer, text, jsonb, timestamptz) to service_role;
