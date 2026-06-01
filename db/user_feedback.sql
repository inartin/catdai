-- ============================================================
-- user_feedback — registered user feedback and beta bug reports
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists user_feedback (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  message     text not null,
  image_name  text,
  image_type  text,
  image_size  integer,
  image_data  text,
  status      text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_at  timestamptz not null default now(),

  constraint user_feedback_message_length
    check (char_length(message) between 1 and 500),

  constraint user_feedback_image_name_length
    check (image_name is null or char_length(image_name) <= 120),

  constraint user_feedback_image_type
    check (image_type is null or image_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),

  constraint user_feedback_image_size
    check (image_size is null or (image_size > 0 and image_size <= 2097152)),

  constraint user_feedback_image_data_length
    check (image_data is null or char_length(image_data) <= 2796204),

  constraint user_feedback_image_fields
    check (
      (image_data is null and image_name is null and image_type is null and image_size is null)
      or
      (image_data is not null and image_type is not null and image_size is not null)
    )
);

create index if not exists idx_user_feedback_created
  on user_feedback (created_at desc);

create index if not exists idx_user_feedback_user
  on user_feedback (user_id, created_at desc);

create index if not exists idx_user_feedback_status
  on user_feedback (status, created_at desc);

alter table user_feedback enable row level security;

create policy "Users can insert own feedback"
  on user_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can read own feedback"
  on user_feedback for select
  using (auth.uid() = user_id);
