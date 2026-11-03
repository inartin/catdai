-- Seed discovery reads every non-null listing address on each RPC page.
-- Cover those reads without scanning the much wider listing rows.
set local lock_timeout = '3s';
create index if not exists listing_collector_address_idx
  on public.listing (address_text) where address_text is not null;
create index if not exists listing_rent_collector_address_idx
  on public.listing_rent (address_text) where address_text is not null;
