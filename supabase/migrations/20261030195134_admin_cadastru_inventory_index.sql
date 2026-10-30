-- pg-delta: transaction=false
-- Cover the inventory scan and latest-city fallback without reading wide property rows.
create index concurrently if not exists cadastru_records_admin_inventory_idx
  on public.cadastru_records (shared_building_number, id desc)
  include (cadastral_number_digits, city, result_type, apartment_area_m2, apartment_floor, next_refresh_after);
