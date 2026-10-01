-- Run in Supabase SQL Editor before deploying the view counter.
create table if not exists public.news_post_views (
  news_post_id uuid not null references public.news_posts(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (news_post_id, visitor_id)
);

alter table public.news_post_views enable row level security;
revoke all on public.news_post_views from anon, authenticated;
grant all on public.news_post_views to service_role;

-- Aggregate in PostgreSQL so PostgREST's row limit cannot truncate views.
create or replace function public.news_post_view_counts(post_ids uuid[])
returns table (news_post_id uuid, view_count bigint)
language sql stable security invoker
set search_path = public
as $$
  select views.news_post_id, count(*)
  from public.news_post_views as views
  where views.news_post_id = any(post_ids)
  group by views.news_post_id;
$$;

revoke all on function public.news_post_view_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.news_post_view_counts(uuid[]) to service_role;
