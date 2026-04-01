-- ============================================================
-- user_activity — last authenticated user visit timestamp
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_activity (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_user_activity_last_seen
  on user_activity (last_seen_at desc);
