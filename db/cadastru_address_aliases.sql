-- Run after db/cadastru_records.sql. Idempotent, additive migration.
-- Full address responses include aggregates that have no single cadastral number.
create table if not exists public.cadastru_address_aliases (
  address_key text primary key,
  cadastral_number text,
  raw_payload jsonb not null,
  lookup_source text check (lookup_source in ('api', 'local')),
  expires_at timestamptz not null,
  check (jsonb_typeof(raw_payload) = 'object')
);
create index if not exists idx_cadastru_address_aliases_number
  on public.cadastru_address_aliases (cadastral_number);
create index if not exists idx_cadastru_address_aliases_expiry
  on public.cadastru_address_aliases (expires_at);
alter table public.cadastru_address_aliases enable row level security;
-- No public policies: only the server service role can access unmasked payloads.

alter table public.cadastru_records alter column full_address drop not null;

-- Existing data expires 30 days after its actual fetch/save, never after a read.
update public.cadastru_records
set next_refresh_after = coalesce(last_official_fetch_at, data_updated_at, saved_at) + interval '30 days'
where next_refresh_after is null;
