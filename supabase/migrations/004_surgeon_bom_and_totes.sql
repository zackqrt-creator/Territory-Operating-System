-- Surgeon preference profiles + tote templates, for predicting exactly what
-- to pack (down to size and lot) instead of a generic per-surgery-type
-- checklist. See README "A note on the pack list" for the modeling
-- decisions (implants = hard per-case requirement, instrument trays =
-- soft advisory, not a blocker).

-- ============================================================================
-- Catalog: the SKU master list. inventory_items keeps its own name/category
-- (existing readiness/staging/quick-log features match on those strings and
-- are left alone) and gets an optional catalog_item_id for the new
-- size/product-line-aware features to hang off of.
-- ============================================================================
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  item_number text,
  name text not null,
  category text not null check (category in ('loaner_kit', 'instrument_tray', 'implant', 'consumable')),
  product_line text, -- e.g. "KA One", "Motopat", "Spherika Efficiency", "GMK Sphere Vit-E"
  side text check (side in ('LEFT', 'RIGHT', 'NA')),
  size_label text, -- e.g. "2+", "17-20"; null for unsized items
  cement_type text check (cement_type in ('cemented', 'cementless', 'NA')),
  created_at timestamptz not null default now()
);

create index if not exists catalog_items_lookup_idx on catalog_items (territory_id, category, product_line);

alter table inventory_items
  add column if not exists catalog_item_id uuid references catalog_items (id);

-- ============================================================================
-- Surgeons + preferences
-- ============================================================================
create table if not exists surgeons (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table cases
  add column if not exists surgeon_id uuid references surgeons (id);
-- cases.surgeon (free text) is kept as a fallback/display field for cases
-- without a matched surgeon profile yet.

-- ============================================================================
-- Tote templates: a named kit (e.g. "KA One Complete Tote"), reusable=true
-- for instrument sets that get resterilized between cases (soft advisory,
-- never blocks a pack list), reusable=false for implant totes (hard
-- per-case requirement — an opened implant can't go back on the shelf).
-- advisory_cases_per_unit is only meaningful when reusable=true: "1 tray
-- comfortably covers about this many same-day cases."
-- ============================================================================
create table if not exists tote_templates (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  name text not null,
  reusable boolean not null default false,
  advisory_cases_per_unit numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists tote_template_items (
  id uuid primary key default gen_random_uuid(),
  tote_template_id uuid not null references tote_templates (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id),
  quantity_per_tote int not null default 1
);

create table if not exists surgeon_preferences (
  id uuid primary key default gen_random_uuid(),
  surgeon_id uuid not null references surgeons (id) on delete cascade,
  territory_id uuid not null references territories (id),
  surgery_type text not null check (surgery_type in ('KNEE', 'HIP')),
  variant text not null default 'total' check (variant in ('total', 'partial')),
  alignment_technique text, -- e.g. "Kinematic"
  cement_type text check (cement_type in ('cemented', 'cementless', 'NA')),
  instrument_tote_id uuid references tote_templates (id),
  implant_tote_id uuid references tote_templates (id),
  notes text,
  created_at timestamptz not null default now(),
  unique (surgeon_id, surgery_type, variant)
);

-- ============================================================================
-- FedEx / carrier tracking on the movement itself (a shipment event), not
-- the item — an item can ship multiple times over its life.
-- ============================================================================
alter table movements
  add column if not exists tracking_number text;

-- ============================================================================
-- Reserve-facility withdrawal alerts (e.g. Lodi storage): flag a facility
-- that should rarely be drawn from, and surface it in red across the app
-- whenever something leaves it, until a lead/rep marks it replenished.
-- There's no push/SMS infrastructure yet, so this is in-app visibility
-- (Activity Feed styling + a Home banner), not a phone notification.
-- ============================================================================
alter table facilities
  add column if not exists alert_on_withdrawal boolean not null default false;

alter table movements
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references profiles (id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table catalog_items enable row level security;
alter table surgeons enable row level security;
alter table surgeon_preferences enable row level security;
alter table tote_templates enable row level security;
alter table tote_template_items enable row level security;

drop policy if exists catalog_items_all on catalog_items;
create policy catalog_items_all on catalog_items for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists surgeons_all on surgeons;
create policy surgeons_all on surgeons for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists surgeon_preferences_all on surgeon_preferences;
create policy surgeon_preferences_all on surgeon_preferences for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists tote_templates_all on tote_templates;
create policy tote_templates_all on tote_templates for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists tote_template_items_all on tote_template_items;
create policy tote_template_items_all on tote_template_items for all
  using (exists (
    select 1 from tote_templates t
    where t.id = tote_template_items.tote_template_id
      and t.territory_id = my_territory_id()
  ))
  with check (exists (
    select 1 from tote_templates t
    where t.id = tote_template_items.tote_template_id
      and t.territory_id = my_territory_id()
  ));
