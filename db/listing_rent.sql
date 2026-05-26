create table if not exists listing_rent (
  id                text primary key default gen_random_uuid()::text,
  source            text not null,
  external_id       text not null,
  source_url        text,
  is_active         boolean not null default true,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  deleted_at        timestamptz,

  title             text not null,
  description       text,
  price_amount      numeric(12,2),
  price_currency    text,
  price_per_m2      numeric(12,2),
  old_price_amount  numeric(12,2),
  images_count      int not null default 0,

  property_type     text,
  deal_type         text,
  area_m2           numeric(10,2),
  rooms_count       int,
  floor             int,
  total_floors      int,
  building_type     text,
  renovation        text,
  bathrooms_count   int,
  balconies_count   int,

  country           text,
  city              text,
  district          text,
  sector            text,
  address_text      text,
  latitude          numeric(9,6),
  longitude         numeric(9,6),

  owner_id          text references owner(id) on delete set null,

  attributes        jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint listing_rent_source_external_id_key unique (source, external_id)
);

create index if not exists listing_rent_source_idx
  on listing_rent (source);
create index if not exists listing_rent_is_active_idx
  on listing_rent (is_active);
create index if not exists listing_rent_source_updated_at_idx
  on listing_rent (source_updated_at);
create index if not exists listing_rent_location_idx
  on listing_rent (city, district, sector);
create index if not exists listing_rent_price_amount_idx
  on listing_rent (price_amount);
create index if not exists listing_rent_area_m2_idx
  on listing_rent (area_m2);
create index if not exists listing_rent_owner_id_idx
  on listing_rent (owner_id);

drop trigger if exists listing_rent_updated_at on listing_rent;
create trigger listing_rent_updated_at
  before update on listing_rent
  for each row execute function update_updated_at();

create table if not exists listing_rent_change_events (
  id                text primary key default gen_random_uuid()::text,
  listing_id        text not null references listing_rent(id) on delete cascade,
  source            text not null,
  external_id       text not null,
  sync_started_at   timestamptz not null,
  observed_at       timestamptz not null default now(),
  event_type        text not null,
  previous_snapshot jsonb,
  current_snapshot  jsonb not null,
  changed_fields    jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists listing_rent_change_events_sync_started_idx
  on listing_rent_change_events (sync_started_at, listing_id);

create unique index if not exists listing_rent_change_events_run_listing_uq
  on listing_rent_change_events (sync_started_at, listing_id);

create index if not exists listing_rent_change_events_listing_idx
  on listing_rent_change_events (listing_id, observed_at desc);

create table if not exists listing_rent_price_history (
  id                text primary key default gen_random_uuid()::text,
  listing_id        text not null references listing_rent(id) on delete cascade,
  price_amount      numeric(12,2) not null,
  price_currency    text not null,
  price_per_m2      numeric(12,2),
  source_updated_at timestamptz,
  observed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists listing_rent_price_history_listing_observed_idx
  on listing_rent_price_history (listing_id, observed_at);

create index if not exists listing_rent_price_history_source_updated_at_idx
  on listing_rent_price_history (source_updated_at);
