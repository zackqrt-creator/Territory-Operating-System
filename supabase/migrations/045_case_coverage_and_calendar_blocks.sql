-- Calendar revamp, part 2: who else is on a case, and what the rest of the
-- day is for.
--
-- Two separate problems that both show up on the same screen:
--
--  1. Coverage. A case belongs to whoever created it, but reps cover for each
--     other constantly -- a second rep runs the room, or takes the case
--     outright when the first is double-booked. There was no way to express
--     that, so the calendar could only ever show one name per case.
--
--  2. Everything that isn't a case. A rep's day is not only surgery: hospital
--     visits, in-services, travel, admin blocks. Without somewhere to put
--     those, the calendar looks free when it isn't.
--
-- Both follow the existing my_territory_id() RLS pattern.

-- 1. Coverage -----------------------------------------------------------------

create table if not exists case_assignees (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  case_id uuid not null references cases (id) on delete cascade,
  profile_id uuid not null references profiles (id),
  -- 'primary' is the rep who owns the case; 'covering' is backup or a second
  -- pair of hands. Kept open-ended rather than a boolean so "observing" or
  -- "training" can be added later without a migration.
  role text not null default 'covering' check (role in ('primary', 'covering', 'observing')),
  note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (case_id, profile_id)
);

create index if not exists case_assignees_case_idx on case_assignees (case_id);
create index if not exists case_assignees_profile_idx
  on case_assignees (territory_id, profile_id);

-- 2. Non-case calendar blocks -------------------------------------------------

create table if not exists calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  rep_id uuid not null references profiles (id),
  block_date date not null,
  start_time time not null,
  end_time time,
  -- The free-text answer to "what is this time slot for".
  label text not null,
  kind text not null default 'other'
    check (kind in ('hospital_visit', 'in_service', 'travel', 'admin', 'personal', 'other')),
  facility_id uuid references facilities (id),
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists calendar_blocks_date_idx
  on calendar_blocks (territory_id, block_date);
create index if not exists calendar_blocks_rep_idx
  on calendar_blocks (territory_id, rep_id, block_date);

-- RLS -------------------------------------------------------------------------

alter table case_assignees enable row level security;
alter table calendar_blocks enable row level security;

drop policy if exists case_assignees_all on case_assignees;
create policy case_assignees_all on case_assignees for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists calendar_blocks_select on calendar_blocks;
create policy calendar_blocks_select on calendar_blocks for select
  using (territory_id = my_territory_id());

drop policy if exists calendar_blocks_insert on calendar_blocks;
create policy calendar_blocks_insert on calendar_blocks for insert
  with check (territory_id = my_territory_id());

-- You can only edit or delete your own blocks, same as time off.
drop policy if exists calendar_blocks_update on calendar_blocks;
create policy calendar_blocks_update on calendar_blocks for update
  using (territory_id = my_territory_id() and rep_id = auth.uid())
  with check (territory_id = my_territory_id() and rep_id = auth.uid());

drop policy if exists calendar_blocks_delete on calendar_blocks;
create policy calendar_blocks_delete on calendar_blocks for delete
  using (territory_id = my_territory_id() and rep_id = auth.uid());

grant select, insert, update, delete on case_assignees to authenticated;
grant select, insert, update, delete on calendar_blocks to authenticated;
