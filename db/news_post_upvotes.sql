-- ============================================================
-- news_post_upvotes — one upvote per authenticated user/news post
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists news_post_upvotes (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references news_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint news_post_upvotes_post_user_key unique (news_post_id, user_id)
);

create index if not exists idx_news_post_upvotes_post
  on news_post_upvotes (news_post_id, created_at desc);

create index if not exists idx_news_post_upvotes_user
  on news_post_upvotes (user_id, created_at desc);

alter table news_post_upvotes enable row level security;

drop policy if exists "Anyone can read news upvotes" on news_post_upvotes;
drop policy if exists "Users can insert own news upvotes" on news_post_upvotes;

create policy "Users can insert own news upvotes"
  on news_post_upvotes for insert
  with check (auth.uid() = user_id);

revoke all on news_post_upvotes from anon;
revoke all on news_post_upvotes from authenticated;
grant insert on news_post_upvotes to authenticated;
grant all on news_post_upvotes to service_role;
