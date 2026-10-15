-- Additive rollout: old clients/history continue to use NULL keys.
alter table public.cadastru_search_events add column if not exists event_key text;
create unique index if not exists idx_cadastru_search_events_event_key
  on public.cadastru_search_events (event_key);
