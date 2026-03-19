-- ============================================================
-- user_entitlements — paywall access control
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_tier_check
    check (tier in ('free', 'paid', 'premium', 'pro', 'business'))
);

create index if not exists idx_user_entitlements_tier
  on user_entitlements (tier);

create or replace function touch_user_entitlements_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_entitlements_updated_at on user_entitlements;
create trigger trg_user_entitlements_updated_at
before update on user_entitlements
for each row execute function touch_user_entitlements_updated_at();

revoke all on user_entitlements from anon, authenticated;
