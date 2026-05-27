-- ============================================================
-- pdf_generation_events — tracks valuation PDF generation
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists pdf_generation_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  session_id text,
  estimate_log_id text references estimate_log(id) on delete set null,
  included_cadastral boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pdf_generation_events_created
  on pdf_generation_events (created_at);

create index if not exists idx_pdf_generation_events_user
  on pdf_generation_events (user_id);

create index if not exists idx_pdf_generation_events_session
  on pdf_generation_events (session_id);
