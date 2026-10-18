alter table public.cadastru_search_events
  drop constraint cadastru_search_events_result_type_check;
alter table public.cadastru_search_events
  add constraint cadastru_search_events_result_type_check
  check (result_type in ('error', 'no_data', 'address_only', 'land_only', 'apartment_only', 'full_data'));
