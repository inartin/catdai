-- ============================================================
-- shared_links — short shareable URLs for evaluations
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists shared_links (
  id              text primary key default gen_random_uuid()::text,
  slug            text not null unique,
  params          jsonb not null,
  sharer_user_id  uuid references auth.users(id) on delete set null,
  sharer_is_paid  boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_shared_links_slug
  on shared_links (slug);

create index if not exists idx_shared_links_sharer
  on shared_links (sharer_user_id);

-- Allow anyone to read shared links (for slug resolution)
alter table shared_links enable row level security;

create policy "Anyone can read shared links"
  on shared_links for select
  using (true);

create policy "Service role can insert shared links"
  on shared_links for insert
  with check (true);
