-- ============================================================================
-- Inventory engine · Phase 1: tracked physical assets
--
-- The KAONE sets (6 of them) and revision totes are physical units that move
-- around a territory and can only be one place at a time. This models each as
-- a first-class object with a live location, a status, and a "next available"
-- date, plus a full movement history (who moved it, when, for which case).
--
-- This is the foundation the readiness math, tray scheduling, and the
-- territory dashboard all build on — and what lets AI later answer
-- "where are my KAONE sets?" and "can I cover next week?".
-- ============================================================================

-- 1. Real-world location types an asset can live at. 'in_transit' is a status,
--    not a place, so it lives on the asset status, not here.
alter table facilities drop constraint if exists facilities_type_check;
alter table facilities add constraint facilities_type_check
  check (type in (
    'storage', 'surgery_center', 'hospital', 'corporate', 'vehicle',
    'sterile_processing', 'warehouse'
  ));

-- 2. The tracked asset itself.
create table if not exists tracked_assets (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  kind text not null check (kind in ('kaone_set', 'revision_tote')),
  code text not null,                             -- "KAONE-1", "REV-1" (rep-editable)
  label text,                                     -- optional friendly name
  location_id uuid references facilities (id),    -- null = location unknown
  status text not null default 'available'
    check (status in (
      'available', 'at_hospital', 'in_surgery',
      'awaiting_pickup', 'sterile_processing', 'in_transit'
    )),
  available_date date,                            -- next day it's free to use
  assigned_case_id uuid references cases (id),
  -- true = seeded shell; location/details not yet confirmed by a human, so the
  -- UI flags it instead of showing a confident-but-fake location.
  is_placeholder boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (territory_id, code)
);

create index if not exists tracked_assets_territory_idx
  on tracked_assets (territory_id, kind, status);

-- 3. Movement / status history for each asset.
create table if not exists asset_movements (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  asset_id uuid not null references tracked_assets (id) on delete cascade,
  from_location uuid references facilities (id),
  to_location uuid references facilities (id),
  status_after text,
  moved_by uuid references profiles (id),
  related_case_id uuid references cases (id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists asset_movements_asset_idx
  on asset_movements (asset_id, created_at desc);

-- 4. Insert-grid support: inserts are size + thickness (10/11/12/13/14/17/20mm).
--    Adding the structured column now so the readiness math can query it later.
alter table catalog_items add column if not exists thickness_mm int;

-- 5. RLS — territory-scoped, same pattern as every other table.
alter table tracked_assets enable row level security;
alter table asset_movements enable row level security;

drop policy if exists tracked_assets_all on tracked_assets;
create policy tracked_assets_all on tracked_assets for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists asset_movements_all on asset_movements;
create policy asset_movements_all on asset_movements for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

-- Explicit grants (belt-and-suspenders alongside migration 020's defaults).
grant select, insert, update, delete on tracked_assets to anon, authenticated;
grant select, insert, update, delete on asset_movements to anon, authenticated;

-- 6. Seed the 6 KAONE sets + 2 revision totes as placeholders. Locations are
--    left unknown on purpose (flagged is_placeholder) — the rep confirms each
--    one's real location in-app rather than the system inventing one. Idempotent.
do $$
declare
  t_id uuid;
  i int;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    return;
  end if;

  for i in 1..6 loop
    insert into tracked_assets (territory_id, kind, code, label, is_placeholder, status)
    select t_id, 'kaone_set', 'KAONE-' || i, 'KAONE Set ' || i, true, 'available'
    where not exists (
      select 1 from tracked_assets where territory_id = t_id and code = 'KAONE-' || i
    );
  end loop;

  for i in 1..2 loop
    insert into tracked_assets (territory_id, kind, code, label, is_placeholder, status)
    select t_id, 'revision_tote', 'REV-' || i, 'Revision Tote ' || i, true, 'available'
    where not exists (
      select 1 from tracked_assets where territory_id = t_id and code = 'REV-' || i
    );
  end loop;
end $$;
