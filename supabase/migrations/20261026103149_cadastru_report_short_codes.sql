-- Keep the original slug and analytics identity; give every saved report a short URL.
alter table public.cadastru_shared_reports
  add column short_code text generated always as (
    translate(encode(substring(sha256(decode(slug, 'hex')) from 1 for 9), 'base64'), '+/', '-_')
  ) stored not null,
  add constraint cadastru_shared_reports_short_code_key unique (short_code);
