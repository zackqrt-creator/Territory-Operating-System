-- ===========================================================================
-- Territory OS — migrations 050 + 051, combined for a single paste.
--
-- Paste the whole file into the Supabase SQL Editor and press Run.
--
-- Safe to run more than once. Every statement is guarded (if not exists /
-- on conflict / drop policy if exists), so a second run changes nothing and
-- errors nothing. If you are unsure whether it already ran, just run it.
--
-- What it turns on:
--   050  The TKA checklist stops asking for five item names that have never
--        existed in this territory and starts asking for the six totes that
--        actually travel, side-aware. Adds manual tick-off, so a rep can
--        confirm a line the catalog cannot see yet without inventing stock.
--   051  Both revision totes and two spare General Efficiency Kits, counted
--        once per surgery day rather than once per case.
--
-- Verified: applies cleanly on a fresh Postgres 16 after migrations 001-049,
-- and again on a database where it has already run.
-- ===========================================================================

-- ============ 050 ============
-- ============================================================================
-- Make the TKA checklist ask the real question, and let a rep answer it by
-- hand when the catalog cannot.
--
-- Two problems, one migration.
--
-- PROBLEM 1 -- the TKA checklist was asking for things that do not exist.
--
-- Migration 001 seeded the TKA template with placeholder lines invented before
-- anyone had seen this territory's stock: 'GMK Total Knee Loaner Kit',
-- 'Primary Knee Instrument Tray', 'Femoral Component', 'Tibial Component',
-- 'Poly Insert'. Readiness matches a template line to inventory by exact name,
-- so those five lines could never match anything and every knee case reported
-- "not found in inventory anywhere" on all of them. That is not a stock
-- problem, it is a vocabulary problem.
--
-- It was also the wrong shape. A rep does not carry "a femoral component" to a
-- knee -- they carry totes, and a complete tote arrives holding the whole size
-- run (femorals 1-7 with the + sizes, tibial trays, the poly ladder, MOTOPAT
-- inserts). Asking "do I have femoral size 4" the night before is the wrong
-- question; "is the right complete tote here" is the question, and the size
-- run is a property of the tote. What actually gets consumed per size is
-- settled after the case by the sticker sheet, which already works.
--
-- So the TKA lines are replaced with the seven things that really travel, and
-- they are side-aware: a right knee needs the RIGHT complete tote, and a left
-- one is not a substitute.
--
-- PROBLEM 2 -- a red line the rep cannot clear is worse than no line.
--
-- The catalog is incomplete and inventory is barely seeded, so even correct
-- names will read "missing" for a while. A rep standing in an OR who can see
-- the tote in front of them needs to be able to say so. case_checklist_marks
-- records that: a per-case, per-line "I have this, it just isn't in the app
-- yet", with a name and a timestamp on it.
--
-- These marks are deliberately NOT inventory. They do not create stock, do not
-- deduct, and do not feed the pack list. They only clear one line on one
-- case's checklist, and the UI keeps them visually distinct from a line backed
-- by real counted stock -- an unverifiable green is exactly how a rep learns
-- to stop trusting the screen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Template lines become side-aware.
-- ---------------------------------------------------------------------------

-- 'ANY' keeps every pre-existing line (THA, partials) behaving exactly as it
-- did, so this column is additive for everything except the TKA rows below.
alter table case_template_items
  add column if not exists applies_to_side text not null default 'ANY';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_template_items_side_chk'
  ) then
    alter table case_template_items
      add constraint case_template_items_side_chk
      check (applies_to_side in ('LEFT', 'RIGHT', 'ANY'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Replace the placeholder TKA lines with what actually travels.
--
-- Sourced from Zack's own description of a total knee haul. Where he named a
-- side ("a right complete tote", "right extra inserts D-107") the line is
-- side-specific; where he did not, it is 'ANY' rather than a guessed split --
-- an over-broad line still shows up and can be checked off, whereas an
-- invented left/right pair puts a phantom requirement on every case. The open
-- questions are recorded in docs/domain.md rather than resolved by guessing.
-- ---------------------------------------------------------------------------

delete from case_template_items
where template_id in (select id from case_templates where name = 'TKA');

insert into case_template_items (template_id, category, name, quantity, applies_to_side)
select t.id, v.category, v.name, v.quantity, v.side
from case_templates t
cross join (values
  -- The tote holding the full implant size run for the operative side.
  ('loaner_kit',      'Complete Tote (Right)',                  1, 'RIGHT'),
  ('loaner_kit',      'Complete Tote (Left)',                   1, 'LEFT'),
  -- D-107: the travel tote of spare inserts that rides along with it.
  ('loaner_kit',      'Extra Inserts Travel Tote D-107 (Right)', 1, 'RIGHT'),
  ('loaner_kit',      'Extra Inserts Travel Tote D-107 (Left)',  1, 'LEFT'),
  -- Single-use instrumentation. Carries trial tibial trays and trial femorals
  -- for both sides, which is why it is not side-specific.
  ('consumable',      'Full Efficiency Tote',                   1, 'ANY'),
  -- Two: the one you plan to open and the spare that saves the case.
  ('consumable',      'General Efficiency Kit',                 2, 'ANY'),
  ('instrument_tray', 'KA One Trays',                           1, 'ANY'),
  ('instrument_tray', 'ReVLite Trays',                          1, 'ANY')
) as v(category, name, quantity, side)
where t.name = 'TKA';

-- ---------------------------------------------------------------------------
-- 3. Manual check-off.
-- ---------------------------------------------------------------------------

create table if not exists case_checklist_marks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  case_id uuid not null references cases (id) on delete cascade,
  -- Identifies the checklist line as 'category|name'. Readiness lines are
  -- computed, not stored, so there is no row to point a foreign key at. A
  -- renamed template line orphans its marks, which is the safe direction:
  -- the line goes back to reporting real inventory rather than staying
  -- silently green under a name nobody confirmed.
  item_key text not null,
  -- Why it is fine -- "in the car", "brought from Lodi, not scanned in yet".
  note text,
  marked_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  -- Presence means checked; unchecking deletes the row.
  unique (case_id, item_key)
);

create index if not exists case_checklist_marks_case_idx
  on case_checklist_marks (case_id);

alter table case_checklist_marks enable row level security;

-- Territory-wide, like the cases they annotate: any rep who can see the case
-- can see and clear its marks, because coverage changes hands and the person
-- who ticked the box is often not the person standing in the OR.
drop policy if exists case_checklist_marks_all on case_checklist_marks;
create policy case_checklist_marks_all on case_checklist_marks for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

grant select, insert, delete on case_checklist_marks to authenticated;

-- ============ 051 ============
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
