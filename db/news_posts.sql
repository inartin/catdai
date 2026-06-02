create table if not exists news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text not null,
  cover_image_url text,
  created_at timestamptz not null default now()
);

alter table news_posts add column if not exists slug text;

create unique index if not exists news_posts_slug_idx on news_posts (slug) where slug is not null;
create index if not exists news_posts_created_at_idx on news_posts (created_at desc);

alter table news_posts enable row level security;

drop policy if exists "No public news post access" on news_posts;
create policy "No public news post access"
  on news_posts
  for all
  using (false)
  with check (false);
