-- ============================================================
-- listing_link_analysis_events — tracks 999.md link analyzer usage
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists listing_link_analysis_events (
  id               bigserial primary key,
  status           text not null check (
    status in (
      'success',
      'unsupported_listing_type',
      'not_chisinau',
      'insufficient_data',
      'not_a_listing',
      'fetch_failed',
      'upstream_blocked'
    )
  ),
  error_code       text,
  user_id          uuid references auth.users(id) on delete set null,
  external_id      text,
  listing_url      text,
  city             text,
  district         text,
  rooms_count      int,
  listing_price    numeric(12,2),
  listing_currency text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_listing_link_analysis_events_created
  on listing_link_analysis_events (created_at desc);

create index if not exists idx_listing_link_analysis_events_status_created
  on listing_link_analysis_events (status, created_at desc);

create index if not exists idx_listing_link_analysis_events_user_created
  on listing_link_analysis_events (user_id, created_at desc);

create index if not exists idx_listing_link_analysis_events_external_created
  on listing_link_analysis_events (external_id, created_at desc);
