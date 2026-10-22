-- Nullable snapshots: historical events and account attribution stay unchanged.
alter table public.estimate_log add column if not exists visitor jsonb;
alter table public.cadastru_search_events add column if not exists visitor jsonb;
alter table public.external_api_usage_events add column if not exists visitor jsonb;
alter table public.pdf_generation_events add column if not exists visitor jsonb;
alter table public.calculator_usage_events add column if not exists visitor jsonb;
alter table public.listing_link_analysis_events add column if not exists visitor jsonb;
alter table public.payment_checkout_events add column if not exists visitor jsonb;
alter table public.ad_source_events add column if not exists visitor jsonb;
alter table public.user_activity add column if not exists visitor jsonb;
alter table public.user_feedback add column if not exists visitor jsonb;
alter table public.user_listing_alerts add column if not exists visitor jsonb;

-- Used by the admin browser-history lookup. No public grants or policies change.
create index if not exists estimate_log_visitor_device_idx
  on public.estimate_log ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists cadastru_search_events_visitor_device_idx
  on public.cadastru_search_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists external_api_usage_events_visitor_device_idx
  on public.external_api_usage_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists pdf_generation_events_visitor_device_idx
  on public.pdf_generation_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists calculator_usage_events_visitor_device_idx
  on public.calculator_usage_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists listing_link_analysis_events_visitor_device_idx
  on public.listing_link_analysis_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists payment_checkout_events_visitor_device_idx
  on public.payment_checkout_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
create index if not exists ad_source_events_visitor_device_idx
  on public.ad_source_events ((visitor->>'device_id'), created_at desc)
  where visitor->>'device_id' is not null;
