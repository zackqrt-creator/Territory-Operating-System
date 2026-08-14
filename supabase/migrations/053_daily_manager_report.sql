-- Daily manager report.
--
-- A rep already records the day's work in this app: tasks get closed, cases get
-- logged, totes get moved, photos get taken. What did not exist was a way to
-- turn that into a professional summary for a manager who -- deliberately --
-- has no access to any of it.
--
-- The privacy shape matters and is the reason this is three tables rather than
-- a view over the existing ones. Territory Operations stays private. A report
-- is a hand-curated, one-way artifact: nothing reaches it unless the rep put it
-- there. Items carry an optional source_type/source_id back to the task or case
-- they were drawn from, so "enter it once" holds, but the report row owns its
-- own copy of the text. Editing a task later does not rewrite history, and
-- deleting one does not blank a sent report.
--
-- A future read-only manager portal is why `status` and `sent_snapshot` exist.
-- Such a portal would read daily_reports where status in ('sent',
-- 'acknowledged') plus that report's own items and photos, and nothing else --
-- no join reaches tasks, notes, inventory or any internal table. No manager
-- access is granted here; these are the seams that would make it safe later.

create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  author_id uuid not null references profiles (id),
  report_date date not null,

  -- Free text rather than a facility reference: a day usually spans several
  -- accounts, and "Stockton / Lodi" is a truer answer than any single row.
  area text,
  summary text,
  important_notes text,

  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'acknowledged', 'archived')),

  sent_at timestamptz,
  sent_to text,
  sent_method text check (sent_method in ('email', 'text', 'pdf', 'verbal', 'other')),
  acknowledged_at timestamptz,
  acknowledgement_note text,

  -- Frozen copy of the generated report at the moment it was marked sent, so a
  -- later edit cannot rewrite what the manager actually received. Nothing reads
  -- this to render the editor; it exists to be looked back at.
  sent_snapshot jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One report per day per rep. Opening "today" twice must land on the same
  -- draft rather than quietly starting a second one.
  unique (territory_id, author_id, report_date)
);

create index if not exists daily_reports_date_idx
  on daily_reports (territory_id, report_date desc);

/*
 * Every line of every section lives here, discriminated by `section`.
 *
 * One table rather than six because the sections differ by which columns they
 * use, not by shape: all of them are an ordered list of "a thing, its state,
 * and some context". Six near-identical tables would mean six policies, six
 * loaders and six insert paths for no gain.
 */
create table if not exists daily_report_items (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  report_id uuid not null references daily_reports (id) on delete cascade,

  section text not null check (section in (
    'completed',        -- what got done
    'equipment',        -- totes, trays, implants, replenishment, missing items
    'outstanding',      -- not finished, and why
    'manager_request',  -- what the manager asked for, and what happened
    'tomorrow',         -- the plan
    'guidance'          -- questions needing an answer before proceeding
  )),

  position integer not null default 0,
  title text not null,
  -- Section-dependent second line: reason outstanding, completion note, "my
  -- understanding of what was asked", or plain notes.
  detail text,

  status text check (status in ('complete', 'in_progress', 'pending', 'needs_attention')),
  -- Kind of work, for the Completed and Tomorrow sections.
  category text,
  next_action text,
  expected_date date,
  priority text check (priority in ('high', 'normal', 'low')),
  location_id uuid references facilities (id),
  quantity integer,
  -- Wall-clock time a manager request came in, when it is known.
  occurred_at timestamptz,
  -- Optional expected time for a planned item, kept as text ("first case",
  -- "before 10") because that is how a day is actually planned.
  planned_time text,

  -- Where this line came from, so the rep does not retype it. Advisory only:
  -- the text above is this row's own and never re-reads the source.
  source_type text check (source_type in ('task', 'case', 'inventory_item', 'tracked_asset', 'note', 'movement')),
  source_id uuid,

  created_at timestamptz not null default now()
);

create index if not exists daily_report_items_report_idx
  on daily_report_items (report_id, section, position);

/*
 * Photos the rep explicitly chose to share.
 *
 * The url is copied rather than referenced because the point of this table is
 * that it is a fixed record: unselecting a photo from a tray later, or deleting
 * the task it hung off, must not silently change what a sent report contained.
 */
create table if not exists daily_report_photos (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  report_id uuid not null references daily_reports (id) on delete cascade,
  url text not null,
  caption text,
  source_type text check (source_type in ('task_photo', 'asset_photo', 'upload')),
  source_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists daily_report_photos_report_idx
  on daily_report_photos (report_id, position);

alter table daily_reports enable row level security;
alter table daily_report_items enable row level security;
alter table daily_report_photos enable row level security;

-- A report belongs to the rep who wrote it. Territory-mates do not read each
-- other's manager updates: this is the one place in the app where the content
-- is about the author's own performance.
drop policy if exists daily_reports_select on daily_reports;
create policy daily_reports_select on daily_reports for select
  using (territory_id = my_territory_id() and author_id = auth.uid());

drop policy if exists daily_reports_insert on daily_reports;
create policy daily_reports_insert on daily_reports for insert
  with check (territory_id = my_territory_id() and author_id = auth.uid());

drop policy if exists daily_reports_update on daily_reports;
create policy daily_reports_update on daily_reports for update
  using (territory_id = my_territory_id() and author_id = auth.uid())
  with check (territory_id = my_territory_id() and author_id = auth.uid());

drop policy if exists daily_reports_delete on daily_reports;
create policy daily_reports_delete on daily_reports for delete
  using (territory_id = my_territory_id() and author_id = auth.uid());

-- Children inherit the parent's visibility exactly, so there is one rule about
-- who can read a report rather than three that can drift apart.
drop policy if exists daily_report_items_all on daily_report_items;
create policy daily_report_items_all on daily_report_items for all
  using (
    territory_id = my_territory_id()
    and exists (
      select 1 from daily_reports r
      where r.id = daily_report_items.report_id and r.author_id = auth.uid()
    )
  )
  with check (
    territory_id = my_territory_id()
    and exists (
      select 1 from daily_reports r
      where r.id = daily_report_items.report_id and r.author_id = auth.uid()
    )
  );

drop policy if exists daily_report_photos_all on daily_report_photos;
create policy daily_report_photos_all on daily_report_photos for all
  using (
    territory_id = my_territory_id()
    and exists (
      select 1 from daily_reports r
      where r.id = daily_report_photos.report_id and r.author_id = auth.uid()
    )
  )
  with check (
    territory_id = my_territory_id()
    and exists (
      select 1 from daily_reports r
      where r.id = daily_report_photos.report_id and r.author_id = auth.uid()
    )
  );

grant select, insert, update, delete on daily_reports to authenticated;
grant select, insert, update, delete on daily_report_items to authenticated;
grant select, insert, update, delete on daily_report_photos to authenticated;
