-- Land parcels are successful results even without apartment/building details.
alter table public.cadastru_search_events
  drop constraint if exists cadastru_search_events_result_type_check;
alter table public.cadastru_search_events
  add constraint cadastru_search_events_result_type_check
  check (result_type in ('no_data', 'address_only', 'land_only', 'apartment_only', 'full_data'));

alter table public.cadastru_records
  drop constraint if exists cadastru_records_result_type_check;
alter table public.cadastru_records
  add constraint cadastru_records_result_type_check
  check (result_type in ('no_data', 'address_only', 'land_only', 'apartment_only', 'full_data'));
