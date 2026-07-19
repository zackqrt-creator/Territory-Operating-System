-- Universal notes: a timestamped, authored note thread attachable to any
-- record (cases, inventory items, loaner totes, surgeons, ...). Team-visible
-- like the rest of the CRM; authors can edit their own notes any time.
--
-- Personal tasks keep their own private notes field instead (this table is
-- territory-visible, which would leak private-task content).

create table if not exists entity_notes (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  author_id uuid references profiles (id),
  entity_type text not null check (entity_type in ('case', 'inventory_item', 'surgeon', 'facility')),
  entity_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists entity_notes_entity_idx on entity_notes (entity_type, entity_id, created_at);

alter table entity_notes enable row level security;

drop policy if exists entity_notes_select on entity_notes;
create policy entity_notes_select on entity_notes for select
  using (territory_id = my_territory_id());

drop policy if exists entity_notes_insert on entity_notes;
create policy entity_notes_insert on entity_notes for insert
  with check (territory_id = my_territory_id() and author_id = auth.uid());

drop policy if exists entity_notes_update on entity_notes;
create policy entity_notes_update on entity_notes for update
  using (territory_id = my_territory_id() and author_id = auth.uid())
  with check (territory_id = my_territory_id());

drop policy if exists entity_notes_delete on entity_notes;
create policy entity_notes_delete on entity_notes for delete
  using (author_id = auth.uid());
