-- ============================================================
-- Migration: add params_hash for reliable deduplication
-- Run this in Supabase SQL Editor AFTER the base shared_links table exists
-- ============================================================

-- 1. Add the params_hash column (nullable so existing rows don't break)
alter table shared_links
  add column if not exists params_hash text;

-- 2. Backfill existing rows: compute md5 of the JSONB cast to text
update shared_links
set params_hash = md5(params::text)
where params_hash is null;

-- 3. Add index for fast dedup lookups by (sharer_user_id, params_hash)
create index if not exists idx_shared_links_dedup
  on shared_links (sharer_user_id, params_hash);

-- 4. Add index for anonymous dedup lookup by params_hash alone
create index if not exists idx_shared_links_params_hash
  on shared_links (params_hash);
