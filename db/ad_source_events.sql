-- ============================================================
-- ad_source_events — first-party source tracking events
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists ad_source_events (
  id          bigserial primary key,
  source      text not null,
  event_name  text not null,
  user_id     uuid references auth.users(id) on delete set null,
  device_id   text,
  session_id  text,
  path        text,
  referrer    text,
  ip_hash     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ad_source_events_source_created
  on ad_source_events (source, created_at desc);

create index if not exists idx_ad_source_events_session
  on ad_source_events (session_id);

create index if not exists idx_ad_source_events_event_created
  on ad_source_events (event_name, created_at desc);

alter table if exists ad_source_events
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_ad_source_events_user_created
  on ad_source_events (user_id, created_at desc);
