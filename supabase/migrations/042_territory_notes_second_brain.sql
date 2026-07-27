-- Territory OS notes + second-brain foundation. Replaces the /notes page's
-- entity_notes-backed search with a real standalone knowledge base: titled
-- notes with type/visibility/pinning/tags, polymorphic links to any record,
-- and a second-brain review queue for future AI/Obsidian-style summarizing.
--
-- entity_notes is untouched -- it's still the right tool for lightweight
-- per-record comment threads (NotesSection component, QuickLogSheet) and
-- keeps doing that job. This is a different, richer surface for a rep's own
-- notes that may or may not be about a specific record.
--
-- RLS here follows the same my_territory_id() pattern as every other table
-- in this schema (no territory_members junction table exists).
--
-- Note-created tasks reuse the existing `tasks` table (entity_type/entity_id
-- linking added in migration 033) instead of a second, note-scoped task
-- table -- so a task spawned from a note shows up in Home's existing
-- urgent-task badge automatically.

create table if not exists territory_notes (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  created_by uuid references profiles (id),
  owner_id uuid references profiles (id),

  title text not null default 'Untitled note',
  body text not null default '',
  note_type text not null default 'general'
    check (note_type in (
      'general', 'case', 'hospital', 'inventory', 'replenishment',
      'loaner', 'consignment', 'surgeon', 'task', 'meeting', 'idea', 'ai_summary'
    )),
  visibility text not null default 'private'
    check (visibility in ('private', 'team', 'territory_admin')),
  source text not null default 'manual'
    check (source in ('manual', 'mobile', 'sticker_photo', 'calendar_import', 'catalog_import', 'ai_generated', 'system')),

  occurred_at timestamptz,
  pinned boolean not null default false,
  archived boolean not null default false,

  ai_summary text,
  ai_action_items jsonb not null default '[]'::jsonb,
  ai_entities jsonb not null default '{}'::jsonb,
  second_brain_status text not null default 'pending'
    check (second_brain_status in ('pending', 'ready', 'synced', 'ignored', 'needs_review')),
  second_brain_path text,

  search_text tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(ai_summary, '')), 'C')
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists territory_note_links (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  note_id uuid not null references territory_notes (id) on delete cascade,

  -- Generic by design: case, facility, surgeon, inventory_item, catalog_item,
  -- tote_template, case_template today; anything else later without a migration.
  entity_type text not null,
  entity_id uuid not null,
  relationship text not null default 'related'
    check (relationship in ('related', 'about', 'decision', 'issue', 'follow_up', 'used_in', 'needed_for', 'source', 'result')),

  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (note_id, entity_type, entity_id, relationship)
);

create table if not exists territory_note_tags (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  color text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (territory_id, name)
);

create table if not exists territory_note_tag_assignments (
  note_id uuid not null references territory_notes (id) on delete cascade,
  tag_id uuid not null references territory_note_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index if not exists territory_notes_territory_created_idx on territory_notes (territory_id, created_at desc);
create index if not exists territory_notes_owner_idx on territory_notes (territory_id, owner_id, created_at desc);
create index if not exists territory_notes_type_idx on territory_notes (territory_id, note_type, created_at desc);
create index if not exists territory_notes_second_brain_status_idx on territory_notes (territory_id, second_brain_status, updated_at desc);
create index if not exists territory_notes_search_idx on territory_notes using gin (search_text);
create index if not exists territory_notes_title_trgm_idx on territory_notes using gin (title gin_trgm_ops);
create index if not exists territory_note_links_entity_idx on territory_note_links (territory_id, entity_type, entity_id);

create or replace view territory_note_feed as
select
  n.id, n.territory_id, n.title, n.body, n.note_type, n.visibility, n.source,
  n.occurred_at, n.pinned, n.archived, n.ai_summary, n.second_brain_status,
  n.second_brain_path, n.created_by, n.owner_id, n.created_at, n.updated_at,
  coalesce(
    jsonb_agg(distinct jsonb_build_object('entity_type', l.entity_type, 'entity_id', l.entity_id, 'relationship', l.relationship))
      filter (where l.id is not null),
    '[]'::jsonb
  ) as links,
  coalesce(
    jsonb_agg(distinct jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
      filter (where t.id is not null),
    '[]'::jsonb
  ) as tags
from territory_notes n
left join territory_note_links l on l.note_id = n.id
left join territory_note_tag_assignments nta on nta.note_id = n.id
left join territory_note_tags t on t.id = nta.tag_id
where n.archived = false
group by n.id
order by n.pinned desc, n.updated_at desc;

create or replace view territory_second_brain_queue as
select id, territory_id, title, body, note_type, source, ai_summary,
  ai_action_items, ai_entities, second_brain_status, second_brain_path,
  created_at, updated_at
from territory_notes
where archived = false
  and second_brain_status in ('pending', 'ready', 'needs_review')
order by
  case second_brain_status when 'needs_review' then 1 when 'pending' then 2 when 'ready' then 3 else 4 end,
  updated_at desc;

create or replace function touch_territory_note_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists territory_notes_touch_updated_at on territory_notes;
create trigger territory_notes_touch_updated_at
before update on territory_notes
for each row execute function touch_territory_note_updated_at();

alter table territory_notes enable row level security;
alter table territory_note_links enable row level security;
alter table territory_note_tags enable row level security;
alter table territory_note_tag_assignments enable row level security;

drop policy if exists territory_notes_select on territory_notes;
create policy territory_notes_select on territory_notes for select
  using (
    territory_id = my_territory_id()
    and (visibility <> 'private' or owner_id = auth.uid() or created_by = auth.uid())
  );

drop policy if exists territory_notes_insert on territory_notes;
create policy territory_notes_insert on territory_notes for insert
  with check (territory_id = my_territory_id());

drop policy if exists territory_notes_update on territory_notes;
create policy territory_notes_update on territory_notes for update
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists territory_notes_delete on territory_notes;
create policy territory_notes_delete on territory_notes for delete
  using (territory_id = my_territory_id() and (owner_id = auth.uid() or created_by = auth.uid()));

drop policy if exists territory_note_links_all on territory_note_links;
create policy territory_note_links_all on territory_note_links for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists territory_note_tags_all on territory_note_tags;
create policy territory_note_tags_all on territory_note_tags for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists territory_note_tag_assignments_all on territory_note_tag_assignments;
create policy territory_note_tag_assignments_all on territory_note_tag_assignments for all
  using (
    exists (select 1 from territory_notes n where n.id = territory_note_tag_assignments.note_id and n.territory_id = my_territory_id())
  )
  with check (
    exists (select 1 from territory_notes n where n.id = territory_note_tag_assignments.note_id and n.territory_id = my_territory_id())
  );

-- Let tasks link to a note (note-spawned tasks reuse this table, not a
-- second one).
alter table tasks drop constraint if exists tasks_entity_type_check;
alter table tasks add constraint tasks_entity_type_check
  check (entity_type in ('case', 'facility', 'surgeon', 'inventory_item', 'catalog_item', 'tote_template', 'case_template', 'note'));
