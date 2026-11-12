create table public.cadastru_pdf_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create index cadastru_pdf_events_created_at_idx on public.cadastru_pdf_events (created_at);

alter table public.cadastru_pdf_events enable row level security;
revoke all on table public.cadastru_pdf_events from public, anon, authenticated;
grant select, insert on table public.cadastru_pdf_events to service_role;
