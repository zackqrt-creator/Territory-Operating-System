-- CaseTrack 2.0 schema
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================

-- One row per territory. Everything else is scoped to a territory_id so this
-- product can support multiple reps/territories later without a rewrite.
create table if not exists territories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Extends Supabase auth.users with app-level profile info.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  territory_id uuid not null references territories (id),
  display_name text not null default 'Rep',
  role text not null default 'rep' check (role in ('rep', 'lead')),
  last_facility_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  type text not null check (type in ('storage', 'surgery_center', 'hospital', 'corporate', 'vehicle')),
  address text,
  created_at timestamptz not null default now()
);

-- One template per surgery type, e.g. "TKA".
create table if not exists case_templates (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  surgery_type text not null check (surgery_type in ('KNEE', 'HIP')),
  variant text not null default 'total' check (variant in ('total', 'partial')),
  created_at timestamptz not null default now()
);

-- Required item categories/names + quantities for a template.
create table if not exists case_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references case_templates (id) on delete cascade,
  category text not null check (category in ('loaner_kit', 'instrument_tray', 'implant', 'consumable')),
  name text not null,
  quantity int not null default 1
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  case_id text, -- myOPS case_id when known; manual entries can leave null
  surgery_type text not null check (surgery_type in ('KNEE', 'INSTRUMENT')),
  side text check (side in ('LEFT', 'RIGHT')),
  surgery_date date not null,
  time_tba boolean not null default false,
  surgery_time time,
  facility_id uuid references facilities (id),
  surgeon text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  template_id uuid references case_templates (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (territory_id, case_id)
);

create index if not exists cases_surgery_date_idx on cases (territory_id, surgery_date);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  category text not null check (category in ('loaner_kit', 'instrument_tray', 'implant', 'consumable')),
  lot_number text,
  barcode_value text,
  location_id uuid not null references facilities (id),
  quantity int not null default 1,
  expiration_date date,
  loaner_return_deadline date,
  assigned_case_id uuid references cases (id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_items_location_idx on inventory_items (territory_id, location_id);
create index if not exists inventory_items_barcode_idx on inventory_items (territory_id, barcode_value);
create index if not exists inventory_items_lot_idx on inventory_items (territory_id, lot_number);

-- Immutable audit log. Never updated or deleted by the app.
create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  item_id uuid not null references inventory_items (id),
  from_location uuid references facilities (id),
  to_location uuid not null references facilities (id),
  moved_by uuid references profiles (id),
  related_case_id uuid references cases (id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists movements_item_idx on movements (item_id, created_at desc);
create index if not exists movements_territory_idx on movements (territory_id, created_at desc);

-- ============================================================================
-- Helper: current user's territory (SECURITY DEFINER avoids RLS recursion)
-- ============================================================================
create or replace function my_territory_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select territory_id from profiles where id = auth.uid();
$$;

-- ============================================================================
-- Row Level Security: every table scoped to the caller's territory
-- ============================================================================
alter table territories enable row level security;
alter table profiles enable row level security;
alter table facilities enable row level security;
alter table case_templates enable row level security;
alter table case_template_items enable row level security;
alter table cases enable row level security;
alter table inventory_items enable row level security;
alter table movements enable row level security;

drop policy if exists territories_select on territories;
create policy territories_select on territories for select
  using (id = my_territory_id());

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (territory_id = my_territory_id());
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid());
drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert
  with check (id = auth.uid());

drop policy if exists facilities_all on facilities;
create policy facilities_all on facilities for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists case_templates_all on case_templates;
create policy case_templates_all on case_templates for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists case_template_items_all on case_template_items;
create policy case_template_items_all on case_template_items for all
  using (exists (
    select 1 from case_templates t
    where t.id = case_template_items.template_id
      and t.territory_id = my_territory_id()
  ))
  with check (exists (
    select 1 from case_templates t
    where t.id = case_template_items.template_id
      and t.territory_id = my_territory_id()
  ));

drop policy if exists cases_all on cases;
create policy cases_all on cases for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists inventory_items_all on inventory_items;
create policy inventory_items_all on inventory_items for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists movements_select on movements;
create policy movements_select on movements for select
  using (territory_id = my_territory_id());
drop policy if exists movements_insert on movements;
create policy movements_insert on movements for insert
  with check (territory_id = my_territory_id());
-- No update/delete policy on movements: the audit log is append-only.

-- ============================================================================
-- New-user bootstrap: auto-create a profile in the single seeded territory.
-- Safe for v1 (single-territory). When you add a second territory, replace
-- this with an invite-code or admin-assignment flow instead.
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_territory uuid;
begin
  select id into default_territory from territories order by created_at limit 1;

  insert into profiles (id, territory_id, display_name)
  values (
    new.id,
    default_territory,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Seed data: one territory, the facility set from the brief, and case
-- templates. Re-running this block is safe (guarded by not-exists checks).
-- ============================================================================
do $$
declare
  t_id uuid;
  tpl_tka uuid;
  tpl_tha uuid;
  tpl_pk uuid;
  tpl_ph uuid;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    insert into territories (name) values ('Sacramento') returning id into t_id;
  end if;

  insert into facilities (territory_id, name, type)
    select t_id, 'Storage Facility A', 'storage'
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Storage Facility A');
  insert into facilities (territory_id, name, type)
    select t_id, 'Storage Facility B', 'storage'
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Storage Facility B');
  insert into facilities (territory_id, name, type)
    select t_id, 'Vehicle', 'vehicle'
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Vehicle');
  insert into facilities (territory_id, name, type)
    select t_id, 'Corporate', 'corporate'
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Corporate');

  if not exists (select 1 from case_templates where territory_id = t_id and name = 'TKA') then
    insert into case_templates (territory_id, name, surgery_type, variant) values (t_id, 'TKA', 'KNEE', 'total') returning id into tpl_tka;
    insert into case_template_items (template_id, category, name, quantity) values
      (tpl_tka, 'loaner_kit', 'GMK Total Knee Loaner Kit', 1),
      (tpl_tka, 'instrument_tray', 'Primary Knee Instrument Tray', 1),
      (tpl_tka, 'implant', 'Femoral Component', 1),
      (tpl_tka, 'implant', 'Tibial Component', 1),
      (tpl_tka, 'implant', 'Poly Insert', 1),
      (tpl_tka, 'consumable', 'Cement', 2);
  end if;

  if not exists (select 1 from case_templates where territory_id = t_id and name = 'THA') then
    insert into case_templates (territory_id, name, surgery_type, variant) values (t_id, 'THA', 'HIP', 'total') returning id into tpl_tha;
    insert into case_template_items (template_id, category, name, quantity) values
      (tpl_tha, 'loaner_kit', 'Total Hip Loaner Kit', 1),
      (tpl_tha, 'instrument_tray', 'Primary Hip Instrument Tray', 1),
      (tpl_tha, 'implant', 'Acetabular Cup', 1),
      (tpl_tha, 'implant', 'Femoral Stem', 1),
      (tpl_tha, 'implant', 'Femoral Head', 1),
      (tpl_tha, 'consumable', 'Cement', 1);
  end if;

  if not exists (select 1 from case_templates where territory_id = t_id and name = 'Partial Knee') then
    insert into case_templates (territory_id, name, surgery_type, variant) values (t_id, 'Partial Knee', 'KNEE', 'partial') returning id into tpl_pk;
    insert into case_template_items (template_id, category, name, quantity) values
      (tpl_pk, 'loaner_kit', 'Partial Knee Loaner Kit', 1),
      (tpl_pk, 'instrument_tray', 'Partial Knee Instrument Tray', 1),
      (tpl_pk, 'implant', 'Unicompartmental Femoral', 1),
      (tpl_pk, 'implant', 'Unicompartmental Tibial', 1);
  end if;

  if not exists (select 1 from case_templates where territory_id = t_id and name = 'Partial Hip') then
    insert into case_templates (territory_id, name, surgery_type, variant) values (t_id, 'Partial Hip', 'HIP', 'partial') returning id into tpl_ph;
    insert into case_template_items (template_id, category, name, quantity) values
      (tpl_ph, 'loaner_kit', 'Partial Hip Loaner Kit', 1),
      (tpl_ph, 'instrument_tray', 'Hemiarthroplasty Instrument Tray', 1),
      (tpl_ph, 'implant', 'Bipolar Head', 1),
      (tpl_ph, 'implant', 'Femoral Stem', 1);
  end if;
end $$;
