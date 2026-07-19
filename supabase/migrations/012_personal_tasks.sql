-- Personal/team tasks (Trello-style): own board, status flow, duplicate-with-
-- date, private by default with opt-in sharing to specific teammates.
--
-- Privacy is enforced at the database layer, not the UI: unlike every other
-- table (territory-wide visibility), a task is only visible to its owner and
-- the people it's explicitly shared with.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  owner_id uuid not null references profiles (id),
  title text not null,
  notes text,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  shared_with uuid[] not null default '{}',
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tasks_owner_idx on tasks (owner_id, status);

alter table tasks enable row level security;

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (territory_id = my_territory_id() and (owner_id = auth.uid() or auth.uid() = any (shared_with)));

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert
  with check (territory_id = my_territory_id() and owner_id = auth.uid());

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  using (territory_id = my_territory_id() and (owner_id = auth.uid() or auth.uid() = any (shared_with)))
  with check (territory_id = my_territory_id());

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete
  using (owner_id = auth.uid());
