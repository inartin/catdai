-- ============================================================
-- user_favorites — saved evaluation bookmarks per user
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_favorites (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  url_path    text not null,
  label       text,
  created_at  timestamptz not null default now(),

  constraint user_favorites_user_url_key unique (user_id, url_path)
);

create index if not exists idx_user_favorites_user
  on user_favorites (user_id, created_at desc);

-- RLS: users can only access their own favorites
alter table user_favorites enable row level security;

create policy "Users can read own favorites"
  on user_favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on user_favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on user_favorites for delete
  using (auth.uid() = user_id);
