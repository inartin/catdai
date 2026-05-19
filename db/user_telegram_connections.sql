-- ============================================================
-- user_telegram_connections — Telegram account link per user
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_telegram_connections (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id      text not null unique,
  telegram_chat_id      text not null unique,
  telegram_username     text,
  telegram_first_name   text,
  telegram_last_name    text,
  telegram_language_code text,
  linked_at             timestamptz not null default now()
);

create table if not exists user_telegram_link_tokens (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_user_telegram_link_tokens_user
  on user_telegram_link_tokens (user_id, created_at desc);

create index if not exists idx_user_telegram_link_tokens_expires
  on user_telegram_link_tokens (expires_at);

revoke all on user_telegram_connections from anon, authenticated;
revoke all on user_telegram_link_tokens from anon, authenticated;
