-- What travels on a surgery day regardless of how many cases are on it.
--
-- Everything the app models today is per case: case_template_items hangs off a
-- template, readiness diffs it per case, and the staging report sums those
-- per-case demands. That is right for a complete tote -- two right knees on
-- Tuesday genuinely need the right-side implants twice over.
--
-- It is wrong for the revision totes. Both of them go in the car on any knee
-- day, as backup for a primary that turns into a revision on the table. They
-- are brought once. Modelled as case lines, a three-knee Tuesday would demand
-- three pairs of revision totes and the staging report would send the rep
-- hunting for four totes that do not exist.
--
-- So: a second, smaller list, keyed to the day rather than the case. Rows here
-- are added to the day's haul exactly once, no matter the case count, provided
-- at least one case that day matches surgery_type.

create table if not exists day_requirements (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id) on delete cascade,
  -- Which kind of day this applies to. 'ANY' rather than NULL on purpose: the
  -- unique constraint below has to stop the same line being seeded twice, and
  -- in Postgres NULL never equals NULL, so a nullable column here would let
  -- duplicates through and make ON CONFLICT silently miss. 'ANY' also matches
  -- how case_template_items.applies_to_side already spells the same idea.
  surgery_type text not null default 'ANY'
    check (surgery_type in ('KNEE', 'HIP', 'INSTRUMENT', 'ANY')),
  category text not null check (category in ('loaner_kit', 'instrument_tray', 'implant', 'consumable')),
  name text not null,
  quantity integer not null default 1 check (quantity > 0),
  -- Shown under the line in the staging report. This is where "in case a
  -- primary turns into a revision" lives, so the rep can tell at a glance
  -- which lines are backup and which are the case itself.
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (territory_id, surgery_type, category, name)
);

create index if not exists day_requirements_territory_idx
  on day_requirements (territory_id);

alter table day_requirements enable row level security;

drop policy if exists day_requirements_all on day_requirements;
create policy day_requirements_all on day_requirements for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

grant select, insert, update, delete on day_requirements to authenticated;

-- ---------------------------------------------------------------------------
-- Ticking off a day line.
--
-- Same bargain as case_checklist_marks in 050: the catalog cannot see most of
-- what is physically in the trunk yet, so a rep must be able to say "it is in
-- the car" without the app inventing stock. Keyed to the date rather than a
-- case, because that is the unit the requirement itself is keyed to.
-- ---------------------------------------------------------------------------

create table if not exists day_checklist_marks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id) on delete cascade,
  on_date date not null,
  -- 'category|name', matching checklistItemKey() in src/lib/readiness.ts.
  item_key text not null,
  note text,
  marked_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  -- Presence means checked; unchecking deletes the row.
  unique (territory_id, on_date, item_key)
);

create index if not exists day_checklist_marks_date_idx
  on day_checklist_marks (territory_id, on_date);

alter table day_checklist_marks enable row level security;

drop policy if exists day_checklist_marks_all on day_checklist_marks;
create policy day_checklist_marks_all on day_checklist_marks for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

grant select, insert, delete on day_checklist_marks to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: what this territory brings to every knee day.
--
-- Dictated by Zack, 2026-08. The two General Efficiency Kits here are spares
-- for the day and sit on top of the two per case already seeded by migration
-- 050 -- his words were "two extra." A one-knee Tuesday therefore asks for
-- four in total. See docs/domain.md §7 if that reading needs correcting; it is
-- a quantity change on one row, nothing structural.
-- ---------------------------------------------------------------------------

insert into day_requirements (territory_id, surgery_type, category, name, quantity, note, sort_order)
select t.id, v.surgery_type, v.category, v.name, v.quantity, v.note, v.sort_order
from territories t
cross join (values
  ('KNEE', 'loaner_kit', 'Revision Tote (Left)',  1,
   'Backup for a primary that becomes a revision. Goes on every knee day, whatever the case count.', 1),
  ('KNEE', 'loaner_kit', 'Revision Tote (Right)', 1,
   'Backup for a primary that becomes a revision. Goes on every knee day, whatever the case count.', 2),
  ('KNEE', 'consumable', 'General Efficiency Kit', 2,
   'Spares for the day, on top of the two each case asks for.', 3)
) as v(surgery_type, category, name, quantity, note, sort_order)
on conflict (territory_id, surgery_type, category, name) do update
  set quantity = excluded.quantity,
      note = excluded.note,
      sort_order = excluded.sort_order;
