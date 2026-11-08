-- Null preserves the distinction between older unrecorded categories and
-- successful results. Each category updates independently on the server.
alter table public.cadastru_search_events
  add column if not exists result_cadastru boolean,
  add column if not exists result_nearby boolean,
  add column if not exists result_transport boolean,
  add column if not exists result_map boolean;
