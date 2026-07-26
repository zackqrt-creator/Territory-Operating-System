-- Schema-direction only: give `tasks` the same optional polymorphic link
-- entity_notes already has, so a future task-linking feature (e.g. "remind
-- me to restock this catalog item" or "follow up with this surgeon") has
-- somewhere to point without another migration. Both columns are nullable
-- and unused by the app today -- no UI, no second-brain logic, no change
-- to existing task behavior.

alter table tasks add column if not exists entity_type text
  check (entity_type in ('case', 'facility', 'surgeon', 'inventory_item', 'catalog_item', 'tote_template', 'case_template'));
alter table tasks add column if not exists entity_id uuid;

create index if not exists tasks_entity_idx on tasks (entity_type, entity_id)
  where entity_type is not null;
