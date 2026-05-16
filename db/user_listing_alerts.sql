-- ============================================================
-- user_listing_alerts — saved listing notification filters per user
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_listing_alerts (
  id                text primary key default gen_random_uuid()::text,
  user_id           uuid not null references auth.users(id) on delete cascade,

  label             text,
  is_active         boolean not null default true,

  website_enabled   boolean not null default true,
  telegram_enabled  boolean not null default false,
  telegram_chat_id  text,

  base_filters      jsonb not null default '{}'::jsonb,
  alert_filters     jsonb not null default '{}'::jsonb,

  last_checked_at   timestamptz,
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint user_listing_alerts_base_filters_object
    check (jsonb_typeof(base_filters) = 'object'),

  constraint user_listing_alerts_alert_filters_object
    check (jsonb_typeof(alert_filters) = 'object')
);

create index if not exists idx_user_listing_alerts_user
  on user_listing_alerts (user_id, created_at desc);

create index if not exists idx_user_listing_alerts_active
  on user_listing_alerts (is_active)
  where is_active = true;

create index if not exists idx_user_listing_alerts_base_filters
  on user_listing_alerts using gin (base_filters);

create index if not exists idx_user_listing_alerts_alert_filters
  on user_listing_alerts using gin (alert_filters);

create or replace function touch_user_listing_alerts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_listing_alerts_updated_at on user_listing_alerts;

create trigger trg_user_listing_alerts_updated_at
before update on user_listing_alerts
for each row execute function touch_user_listing_alerts_updated_at();

alter table user_listing_alerts enable row level security;

create policy "Users can read own listing alerts"
  on user_listing_alerts for select
  using (auth.uid() = user_id);

create policy "Users can insert own listing alerts"
  on user_listing_alerts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own listing alerts"
  on user_listing_alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own listing alerts"
  on user_listing_alerts for delete
  using (auth.uid() = user_id);
