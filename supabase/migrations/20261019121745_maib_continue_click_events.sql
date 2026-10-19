begin;

alter table public.payment_checkout_events
  drop constraint if exists payment_checkout_events_type_check;
alter table public.payment_checkout_events
  add constraint payment_checkout_events_type_check
  check (event_type in (
    'checkout_popup_opened',
    'checkout_page_opened',
    'pricing_page_opened',
    'checkout_order_created',
    'maib_continue_clicked'
  ));

commit;
