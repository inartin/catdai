-- ============================================================
-- user_notifications — personalized in-app messages
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_notifications (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  source      text not null default 'admin' check (source in ('admin', 'system')),
  read_at     timestamptz,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint user_notifications_title_length
    check (char_length(title) between 1 and 120),

  constraint user_notifications_body_length
    check (char_length(body) between 1 and 1000)
);

create index if not exists idx_user_notifications_user_created
  on user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_user_unread
  on user_notifications (user_id, created_at desc)
  where read_at is null and archived_at is null;

alter table user_notifications enable row level security;

create policy "Users can read own notifications"
  on user_notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark own notifications"
  on user_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on user_notifications from anon;
grant select on user_notifications to authenticated;
grant update (read_at, archived_at) on user_notifications to authenticated;
grant all on user_notifications to service_role;
