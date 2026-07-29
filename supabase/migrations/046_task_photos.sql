-- Photos on a task, tagged by which stage they were taken at.
--
-- Tasks already move through todo -> doing -> done. A rep's proof of what
-- happened is almost always a photo: the tray as found, the tray mid-fix, the
-- tray back in the rack. Attaching the photo to the stage it belongs to makes
-- a task a record of the work rather than just a checkbox.
--
-- Photos live in the existing public 'item-photos' storage bucket (created in
-- migration 008); this table only stores the resulting public URL.

create table if not exists task_photos (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  task_id uuid not null references tasks (id) on delete cascade,
  -- Mirrors tasks.status so a photo can be filed under the stage it documents.
  stage text not null check (stage in ('todo', 'doing', 'done')),
  url text not null,
  caption text,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists task_photos_task_idx on task_photos (task_id, stage);

alter table task_photos enable row level security;

-- Visibility follows the task: you can see a task's photos if the task is
-- yours or shared with you. Mirrors the tasks_select policy from 012 rather
-- than inventing a second rule.
drop policy if exists task_photos_select on task_photos;
create policy task_photos_select on task_photos for select
  using (
    territory_id = my_territory_id()
    and exists (
      select 1 from tasks t
      where t.id = task_photos.task_id
        and (t.owner_id = auth.uid() or auth.uid() = any (t.shared_with))
    )
  );

drop policy if exists task_photos_insert on task_photos;
create policy task_photos_insert on task_photos for insert
  with check (
    territory_id = my_territory_id()
    and exists (
      select 1 from tasks t
      where t.id = task_photos.task_id
        and (t.owner_id = auth.uid() or auth.uid() = any (t.shared_with))
    )
  );

-- Only the person who took the photo can remove it.
drop policy if exists task_photos_delete on task_photos;
create policy task_photos_delete on task_photos for delete
  using (territory_id = my_territory_id() and uploaded_by = auth.uid());

grant select, insert, delete on task_photos to authenticated;
