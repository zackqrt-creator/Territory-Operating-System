-- Team communication board: a shared, territory-scoped space where the reps
-- on a territory post notes, assign to-dos to each other, tag teammates, and
-- reply in a thread. Multi-user by design (everyone on the territory sees the
-- same board).

create table if not exists board_posts (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  author_id uuid references profiles (id),
  body text not null,
  kind text not null default 'note' check (kind in ('note', 'todo')),
  assignee_id uuid references profiles (id),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references profiles (id),
  -- Teammates tagged/notified on this post (in-app only; no push yet).
  mentioned_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists board_posts_territory_idx on board_posts (territory_id, created_at desc);

create table if not exists board_comments (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  post_id uuid not null references board_posts (id) on delete cascade,
  author_id uuid references profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists board_comments_post_idx on board_comments (post_id, created_at);

alter table board_posts enable row level security;
alter table board_comments enable row level security;

drop policy if exists board_posts_all on board_posts;
create policy board_posts_all on board_posts for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists board_comments_all on board_comments;
create policy board_comments_all on board_comments for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());
