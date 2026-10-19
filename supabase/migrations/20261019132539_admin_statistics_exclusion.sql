-- Operational records remain usable. Their statistics policy is fixed at creation
-- so marking/unmarking an admin never changes historical dashboard totals.
alter table public.user_favorites
  add column if not exists collect_statistics boolean not null default true;
alter table public.shared_links
  add column if not exists collect_statistics boolean not null default true;
alter table public.user_listing_alerts
  add column if not exists collect_statistics boolean not null default true;
