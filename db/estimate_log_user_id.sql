-- ============================================================
-- estimate_log.user_id — attach logged-in user to estimation logs
-- Run this in Supabase SQL Editor
-- ============================================================

alter table if exists estimate_log
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_estimate_log_user
  on estimate_log (user_id);
