create table public.cadastru_building_management (
  origin_key text primary key,
  lookup_input jsonb not null check (jsonb_typeof(lookup_input) = 'object'),
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > fetched_at)
);

alter table public.cadastru_building_management enable row level security;
revoke all on public.cadastru_building_management from public, anon, authenticated;
grant select, insert, update on public.cadastru_building_management to service_role;
