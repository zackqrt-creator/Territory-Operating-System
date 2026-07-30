-- ============================================================================
-- 048: notes and tasks attach to anything.
--
-- This is a notes- and task-heavy app: a rep's real knowledge is "that tray is
-- missing a 4", "this REF is the one Sidhu hates", "that transfer was actually
-- Wednesday, not Tuesday" -- and none of it fits in a schema column. So every
-- record needs an editable, deletable note thread and its own task list.
--
-- entity_notes already accepted catalog_item / tote_template / case_template
-- (032), but the app's TypeScript union never did, so those were unreachable.
-- This widens both tables to the same list and adds the ones still missing:
--
--   movement       -- correcting or explaining a logged move
--   calendar_block -- what a blocked-out slot was actually for
--   task           -- discussion on a task, separate from its own notes field
--   territory      -- a general pinboard not tied to any one record
--
-- Both constraints are set from the same list so a note and a task can always
-- hang off the same thing; they drifted apart before and it silently removed
-- the ability to file work against half the app.
-- ============================================================================

alter table entity_notes drop constraint if exists entity_notes_entity_type_check;
alter table entity_notes add constraint entity_notes_entity_type_check
  check (entity_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory'
  ));

alter table tasks drop constraint if exists tasks_entity_type_check;
alter table tasks add constraint tasks_entity_type_check
  check (entity_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory'
  ));

-- Every record's panel opens with "notes and tasks for this thing", so both
-- lookups are by (entity_type, entity_id) and both deserve an index.
create index if not exists entity_notes_entity_idx
  on entity_notes (entity_type, entity_id, created_at desc);

create index if not exists tasks_entity_idx
  on tasks (entity_type, entity_id, created_at desc);
