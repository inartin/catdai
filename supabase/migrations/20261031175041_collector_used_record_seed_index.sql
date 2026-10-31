-- Successful user lookups are a tiny subset of collector-generated unit records.
-- Bound discovery work to that subset instead of scanning the full property heap.
create index if not exists cadastru_records_collector_used_idx
  on public.cadastru_records (cadastral_number) where lookup_count > 0;
