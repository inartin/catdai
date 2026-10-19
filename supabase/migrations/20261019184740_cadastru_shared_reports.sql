-- Reports are published only by the authenticated share API after an unlock check.
-- Browser roles cannot list reports or create grants; public reads require a slug.
create table public.cadastru_shared_reports (
  slug text primary key check (slug ~ '^[a-f0-9]{48}$'),
  sharer_user_id uuid references auth.users(id) on delete set null,
  report_hash text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  collect_statistics boolean not null default true,
  created_at timestamptz not null default now(),
  unique (sharer_user_id, report_hash)
);

alter table public.cadastru_shared_reports enable row level security;
revoke all on public.cadastru_shared_reports from public, anon, authenticated;
grant select, insert on public.cadastru_shared_reports to service_role;
