begin;

-- Private, server-authored checkout snapshot; never included in publicOrder().
alter table public.maib_payment_orders add column if not exists cadastru_delivery jsonb
  check (cadastru_delivery is null or jsonb_typeof(cadastru_delivery) = 'object');

-- Publish and unlock together, after verified payment. Retries and browser loads
-- reuse the ordinary lookup keys, so email delivery cannot charge twice.
create or replace function public.publish_maib_cadastru_result(p_order_id uuid, p_slug text)
returns text language plpgsql security invoker set search_path = public as $$
declare
  o public.maib_payment_orders%rowtype;
  delivery jsonb;
  usage_key text;
  free_key text;
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  credit record;
  locked_user uuid;
begin
  select * into o from public.maib_payment_orders where id = p_order_id;
  if not found or o.user_id is null then return null; end if;
  -- Same lock order as payment confirmation and guest-account transfer.
  locked_user := o.user_id;
  perform pg_advisory_xact_lock(hashtext(locked_user::text), hashtext('payment-credits'));
  select * into o from public.maib_payment_orders where id = p_order_id for update;
  if o.user_id is distinct from locked_user then raise exception 'order ownership changed; retry delivery'; end if;
  delivery := o.cadastru_delivery;
  if o.product_key <> 'cadastru_lookup_single' or o.paid_at is null
    or o.status not in ('paid', 'partially_refunded') or delivery is null then return null; end if;
  if delivery->>'slug' is not null then return delivery->>'slug'; end if;
  usage_key := delivery->>'usage_key';
  if usage_key is null or usage_key !~ '^paid:cadastru_lookup:[a-f0-9]{32}$'
    or jsonb_typeof(delivery->'payload') is distinct from 'object'
    or p_slug is null or p_slug !~ '^[a-f0-9]{48}$' then raise exception 'invalid cadastru delivery'; end if;

  if not exists(select 1 from public.user_feature_usage_events
    where user_id = o.user_id and feature_key = 'cadastru_lookup' and idempotency_key = usage_key) then
    free_key := to_char(month_start at time zone 'UTC', 'YYYY-MM') || ':cadastru_lookup:' ||
      substr(encode(sha256(convert_to('{"idempotencyKey":"' || usage_key || '"}', 'UTF8')), 'hex'), 1, 32);
    select * into credit from public.consume_free_monthly_credit(o.user_id, 'cadastru_lookup', free_key,
      month_start, month_start + interval '1 month', 1, delivery->'metadata');
    if not credit.allowed then
      select * into credit from public.consume_user_credit(o.user_id, 'cadastru_lookup', usage_key, delivery->'metadata');
    end if;
    if not credit.allowed then raise exception 'cadastru result could not be unlocked'; end if;
  end if;

  insert into public.cadastru_shared_reports(slug, sharer_user_id, report_hash, payload, collect_statistics, search_event_id)
    values(p_slug, o.user_id, 'maib-result:' || o.id::text, delivery->'payload',
      coalesce((delivery->>'collect_statistics')::boolean, false),
      (select id from public.cadastru_search_events where id = (delivery->>'search_event_id')::bigint and user_id = o.user_id));
  update public.maib_payment_orders set cadastru_delivery = delivery || jsonb_build_object('slug', p_slug)
    where id = o.id;
  return p_slug;
end $$;
revoke all on function public.publish_maib_cadastru_result(uuid,text) from public, anon, authenticated;
grant execute on function public.publish_maib_cadastru_result(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
