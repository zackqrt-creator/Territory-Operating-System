-- Task delegation + note follow-ups.
--
-- assigned_to: a task can now be assigned to a teammate. The assignee can see
-- it and move its status (enforced by RLS, same layer as task privacy), while
-- the owner keeps edit/delete rights. Null = it's your own task, unchanged.
--
-- source_note_id: a task can be born from an entity note ("⏰ Follow up" on
-- any note), keeping the link back to the intel that spawned it. If the note
-- is deleted the task survives with the link cleared.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'tasks' and column_name = 'assigned_to'
  ) then
    alter table tasks add column assigned_to uuid references profiles (id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'tasks' and column_name = 'source_note_id'
  ) then
    alter table tasks add column source_note_id uuid references entity_notes (id) on delete set null;
  end if;
end $$;

create index if not exists tasks_assigned_idx on tasks (assigned_to, status);

-- Visibility: owner, assignee, or explicitly shared. Still private otherwise.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (
    territory_id = my_territory_id()
    and (owner_id = auth.uid() or assigned_to = auth.uid() or auth.uid() = any (shared_with))
  );

-- The assignee can update (move status, add notes); delete stays owner-only.
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  using (
    territory_id = my_territory_id()
    and (owner_id = auth.uid() or assigned_to = auth.uid() or auth.uid() = any (shared_with))
  )
  with check (territory_id = my_territory_id());
