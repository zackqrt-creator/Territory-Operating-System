-- ============================================================================
-- Notebooks: folders for wiki pages.
--
-- Self-referencing parent_id supports nesting (a folder inside a folder),
-- though the UI starts flat. A page with notebook_id null is "Unfiled" —
-- nothing forces filing on creation, since quick capture should never be
-- blocked on picking a folder first.
--
-- Checklists ("- [ ] text" / "- [x] text" lines) need no schema change —
-- they're just markdown convention inside the existing body/entity_notes
-- text columns, parsed and toggled client-side.
-- ============================================================================

create table if not exists notebooks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  parent_id uuid references notebooks (id) on delete cascade,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists notebooks_territory_idx on notebooks (territory_id, parent_id);

alter table notebooks enable row level security;

drop policy if exists notebooks_select on notebooks;
create policy notebooks_select on notebooks for select
  using (territory_id = my_territory_id());

drop policy if exists notebooks_insert on notebooks;
create policy notebooks_insert on notebooks for insert
  with check (territory_id = my_territory_id());

drop policy if exists notebooks_update on notebooks;
create policy notebooks_update on notebooks for update
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists notebooks_delete on notebooks;
create policy notebooks_delete on notebooks for delete
  using (territory_id = my_territory_id());

grant select, insert, update, delete on notebooks to anon, authenticated;

alter table pages add column if not exists notebook_id uuid references notebooks (id) on delete set null;
create index if not exists pages_notebook_idx on pages (territory_id, notebook_id);
