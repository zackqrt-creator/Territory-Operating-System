-- ============================================================================
-- 058: the object graph foundation — universal tags, entity-to-entity links,
-- and an append-only event log.
--
-- Everything in the app already agrees on one identity scheme: a record is
-- (entity_type, entity_id). entity_notes and tasks use it (048), territory
-- notes link to it (042), wiki pages point at it (page_entity_type). This
-- migration doesn't replace any of that or move a single row — it adds three
-- thin tables that key off the same convention, so tagging, linking, and
-- eventing work uniformly across every kind of record without touching what
-- already stores case/inventory_item/facility/etc. data.
--
-- Why this shape and not a physical "entities" table: this app already
-- resolves (entity_type, entity_id) back to the owning table everywhere it
-- needs to (NotesSection, task lists, wiki pages). Introducing a second,
-- parallel entities table would mean migrating every existing row into it and
-- keeping two identities in sync forever. Keying straight off the existing
-- convention gets the same graph with a fraction of the migration risk.
--
-- entity_type is intentionally wider than what has physical tables today.
-- person/place/asset/document/photo aren't wired to a dedicated table yet,
-- but the roadmap calls for them, and a CHECK constraint costs nothing to
-- widen now versus a follow-up migration once those tables exist.
-- ============================================================================

create table if not exists entity_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  tag_id uuid not null references territory_note_tags (id) on delete cascade,
  entity_type text not null check (entity_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory', 'person', 'place', 'asset', 'document', 'photo'
  )),
  entity_id uuid not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (tag_id, entity_type, entity_id)
);

create index if not exists entity_tag_assignments_entity_idx
  on entity_tag_assignments (territory_id, entity_type, entity_id);
create index if not exists entity_tag_assignments_tag_idx
  on entity_tag_assignments (tag_id);

-- Directed edges between any two records — case→person, asset→photo,
-- case→facility, note is already covered by territory_note_links, this is
-- the general graph everything else hangs off. relation is free text on
-- purpose, same call territory_note_links made: a fixed vocabulary here
-- would need a migration for every new relationship an industry template
-- wants (e.g. construction's "job→site", insurance's "claim→policy").
create table if not exists entity_links (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  from_type text not null check (from_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory', 'person', 'place', 'asset', 'document', 'photo'
  )),
  from_id uuid not null,
  to_type text not null check (to_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory', 'person', 'place', 'asset', 'document', 'photo'
  )),
  to_id uuid not null,
  relation text not null default 'related',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id, relation)
);

create index if not exists entity_links_from_idx on entity_links (territory_id, from_type, from_id);
create index if not exists entity_links_to_idx on entity_links (territory_id, to_type, to_id);

-- Append-only. Never updated or deleted by the app, same rule as movements.
-- This is the corpus everything downstream reads: pattern detection, "what
-- do I do every Tuesday", automation suggestions, and eventually AI search
-- are all queries over this table plus the entities it points at — nothing
-- else needs to be built to unlock those, just readers of this log.
create table if not exists entity_events (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  entity_type text not null check (entity_type in (
    'case', 'inventory_item', 'surgeon', 'facility', 'catalog_item',
    'tote_template', 'case_template', 'movement', 'calendar_block',
    'task', 'note', 'territory', 'person', 'place', 'asset', 'document', 'photo'
  )),
  entity_id uuid not null,
  verb text not null,
  actor_id uuid references profiles (id),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists entity_events_entity_idx
  on entity_events (territory_id, entity_type, entity_id, occurred_at desc);
create index if not exists entity_events_territory_idx
  on entity_events (territory_id, occurred_at desc);
create index if not exists entity_events_verb_idx
  on entity_events (territory_id, verb, occurred_at desc);

-- ============================================================================
-- RLS — same territory-scoped shape as every other table here.
-- ============================================================================

alter table entity_tag_assignments enable row level security;
alter table entity_links enable row level security;
alter table entity_events enable row level security;

drop policy if exists entity_tag_assignments_select on entity_tag_assignments;
create policy entity_tag_assignments_select on entity_tag_assignments for select
  using (territory_id = my_territory_id());

drop policy if exists entity_tag_assignments_insert on entity_tag_assignments;
create policy entity_tag_assignments_insert on entity_tag_assignments for insert
  with check (territory_id = my_territory_id());

drop policy if exists entity_tag_assignments_delete on entity_tag_assignments;
create policy entity_tag_assignments_delete on entity_tag_assignments for delete
  using (territory_id = my_territory_id());

drop policy if exists entity_links_select on entity_links;
create policy entity_links_select on entity_links for select
  using (territory_id = my_territory_id());

drop policy if exists entity_links_insert on entity_links;
create policy entity_links_insert on entity_links for insert
  with check (territory_id = my_territory_id());

drop policy if exists entity_links_delete on entity_links;
create policy entity_links_delete on entity_links for delete
  using (territory_id = my_territory_id());

drop policy if exists entity_events_select on entity_events;
create policy entity_events_select on entity_events for select
  using (territory_id = my_territory_id());

drop policy if exists entity_events_insert on entity_events;
create policy entity_events_insert on entity_events for insert
  with check (territory_id = my_territory_id());

-- No update/delete policy on entity_events by design — append-only.
