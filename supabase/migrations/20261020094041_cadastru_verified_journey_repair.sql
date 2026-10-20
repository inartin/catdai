-- Recover exact correlation for the investigated day by verifying the original
-- JS event-key hash. No address/time proximity heuristics and no generated row IDs.
with lookups as (
  select distinct response_headers->>'x-catdai-lookup-id' as lookup_id
  from public.external_api_usage_events
  where created_at >= '2026-10-20 00:00:00 Europe/Chisinau'
    and created_at < '2026-10-21 00:00:00 Europe/Chisinau'
    and response_headers->>'x-catdai-lookup-id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
update public.cadastru_search_events s set lookup_id = l.lookup_id::uuid
from lookups l
where s.lookup_id is null
  and s.created_at >= '2026-10-20 00:00:00 Europe/Chisinau'
  and s.created_at < '2026-10-21 00:00:00 Europe/Chisinau'
  and s.event_key = encode(sha256(convert_to(concat(
    '[', to_json(l.lookup_id)::text, ',', coalesce(to_json(s.user_id::text)::text, 'null'),
    ',', to_json(s.search_type)::text, ',',
    coalesce(to_json(coalesce(nullif(s.search_address, ''), s.cadastral_number))::text, 'null'), ']'
  ), 'UTF8')), 'hex');

-- Only the two manually investigated anonymous -> login pairs are consolidated.
-- Retain their original rows and IDs so existing signed tokens remain resolvable.
with pairs as (
  select lookup_id, cadastral_number,
    min(id) filter (where user_id is null) as original_id,
    min(id) filter (where user_id is not null) as replay_id
  from public.cadastru_search_events
  where lookup_id is not null and duplicate_of is null and search_type = 'number'
    and cadastral_number in ('4145107.0337', '9420109.243')
    and created_at >= '2026-10-20 00:00:00 Europe/Chisinau'
    and created_at < '2026-10-21 00:00:00 Europe/Chisinau'
  group by lookup_id, cadastral_number
  having count(*) = 2 and count(user_id) = 1
), repaired as (
  update public.cadastru_search_events original
  set user_id = replay.user_id,
      result_type = replay.result_type,
      valuation_clicked_at = coalesce(original.valuation_clicked_at, replay.valuation_clicked_at),
      valuation_completed_at = coalesce(original.valuation_completed_at, replay.valuation_completed_at)
  from pairs p, public.cadastru_search_events replay
  where original.id = p.original_id and replay.id = p.replay_id
    and original.created_at < replay.created_at
  returning original.id, replay.id as replay_id
)
update public.cadastru_search_events replay set duplicate_of = repaired.id
from repaired where replay.id = repaired.replay_id;

update public.cadastru_shared_reports r set search_event_id = s.duplicate_of
from public.cadastru_search_events s
where r.search_event_id = s.id and s.duplicate_of is not null;

-- This property's stored official result was fetched on October 12, not during
-- the October 20 lookup. Verify that evidence before correcting its source.
update public.cadastru_search_events s set lookup_source = 'cache'
from public.cadastru_records r
where s.cadastral_number = '9420109.243' and r.cadastral_number = s.cadastral_number
  and s.lookup_id is not null
  and s.created_at >= '2026-10-20 00:00:00 Europe/Chisinau'
  and s.created_at < '2026-10-21 00:00:00 Europe/Chisinau'
  and r.last_official_fetch_at < '2026-10-20 00:00:00 Europe/Chisinau'
  and r.next_refresh_after > s.created_at
  and not exists (
    select 1 from public.external_api_usage_events e
    where e.service = 'cadastru_number'
      and e.response_headers->>'x-catdai-lookup-id' = s.lookup_id::text
  );
