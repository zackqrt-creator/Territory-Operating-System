-- Team wall categories: lightweight channels so the stream stays organized
-- as posts accumulate. Existing posts land in 'general'.
alter table board_posts add column if not exists category text not null default 'general'
  check (category in ('general', 'inventory', 'cases', 'schedule'));
