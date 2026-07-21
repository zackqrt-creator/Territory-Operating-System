-- ============================================================================
-- Wiki pages: Obsidian-style linked notes.
--
-- Unlike entity_notes (a timestamped, author-owned comment thread pinned to
-- one record), a page is a standalone, team-editable markdown document that
-- can link to other pages with [[Title]] syntax. Surgeons, facilities, and
-- tote templates each get a canonical page (entity_type/entity_id set) so
-- the pack-list/allocation engine has one page to read structured facts off
-- of; anything else (a troubleshooting writeup, a general runbook) is a
-- freestanding page with entity_type/entity_id left null.
--
-- Link parsing and structured "Key:: value" field extraction happen in the
-- app layer on save — this migration only stores the raw body and the
-- resolved/unresolved link graph.
-- ============================================================================

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  title text not null,
  slug text not null,                              -- lowercase-dashed, unique per territory
  body text not null default '',                    -- markdown, may contain [[wikilinks]]
  tags text[] not null default '{}',
  -- When set, this is the one canonical page for that record (e.g. a Surgeon
  -- row) — structured fields parsed from the body feed back into real tables.
  entity_type text check (entity_type in ('surgeon', 'facility', 'tote_template', 'catalog_item')),
  entity_id uuid,
  pinned boolean not null default false,
  created_by uuid references profiles (id),
  last_edited_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pages_territory_slug_idx on pages (territory_id, slug);
create unique index if not exists pages_territory_entity_idx on pages (territory_id, entity_type, entity_id)
  where entity_type is not null;
create index if not exists pages_territory_title_idx on pages (territory_id, title);

alter table pages enable row level security;

drop policy if exists pages_select on pages;
create policy pages_select on pages for select
  using (territory_id = my_territory_id());

drop policy if exists pages_insert on pages;
create policy pages_insert on pages for insert
  with check (territory_id = my_territory_id() and created_by = auth.uid());

-- Wiki pages are team-editable, unlike entity_notes — anyone in the
-- territory can refine a Set/Surgeon page, not just its original author.
drop policy if exists pages_update on pages;
create policy pages_update on pages for update
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists pages_delete on pages;
create policy pages_delete on pages for delete
  using (territory_id = my_territory_id());

-- Resolved + unresolved [[links]] parsed out of a page's body. Re-derived in
-- full every time the page is saved (delete-then-insert from the app), so
-- this table is always a snapshot of the current body, not a change log.
create table if not exists page_links (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  source_page_id uuid not null references pages (id) on delete cascade,
  -- Null when the linked title doesn't match any existing page yet — the
  -- backlink still shows up on that title's page once it's created.
  target_page_id uuid references pages (id) on delete cascade,
  target_title text not null,
  created_at timestamptz not null default now()
);

create index if not exists page_links_source_idx on page_links (source_page_id);
create index if not exists page_links_target_idx on page_links (target_page_id);
create index if not exists page_links_territory_title_idx on page_links (territory_id, target_title);

alter table page_links enable row level security;

drop policy if exists page_links_select on page_links;
create policy page_links_select on page_links for select
  using (territory_id = my_territory_id());

drop policy if exists page_links_insert on page_links;
create policy page_links_insert on page_links for insert
  with check (territory_id = my_territory_id());

drop policy if exists page_links_delete on page_links;
create policy page_links_delete on page_links for delete
  using (territory_id = my_territory_id());

-- Loaner-code equivalency: an instrument set ordered under one code can
-- arrive shipped under a different loaner code. Structured so the app can
-- warn ("expect this under a different code") instead of relying on notes.
alter table catalog_items add column if not exists equivalent_loaner_code text;
comment on column catalog_items.equivalent_loaner_code is
  'Loaner code this item is known to ship under instead of its own item_number, when ordered as a loaner substitute.';
