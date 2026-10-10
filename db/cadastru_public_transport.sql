-- Public transport has its own 30-day freshness deadline. Expired rows are retained.
create table if not exists public.cadastru_public_transport (
  origin_key text primary key,
  lookup_input jsonb not null check (jsonb_typeof(lookup_input) = 'object'),
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > fetched_at)
);

alter table public.cadastru_public_transport enable row level security;
revoke all on public.cadastru_public_transport from anon, authenticated;
grant select, insert, update on public.cadastru_public_transport to service_role;
-- No public policies: the server service role owns shared transport snapshots.
