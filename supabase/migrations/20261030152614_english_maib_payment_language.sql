-- Keep Romanian as the default while accepting English checkout snapshots.
alter table public.maib_payment_orders
  drop constraint if exists maib_payment_orders_language_check;
alter table public.maib_payment_orders
  add constraint maib_payment_orders_language_check check (language in ('ro', 'ru', 'en'));
