-- Photos of how a tray was packed when it reached us.
--
-- A loaner tray arrives with every instrument seated in its own molded slot,
-- and it has to go back exactly that way. The rep pulls pieces out across a
-- case and then has to restore the original layout from memory, standing in a
-- hallway at the hospital. One overhead shot of a closed kit does not help
-- with that -- what helps is a picture of each layer as it actually arrived,
-- plus a shot of the outside label so there is no doubt which tray it is.
--
-- Two kinds, because they answer different questions:
--   'label'  -- what tray is this (outside label, one per kit)
--   'layer'  -- where does everything go (inside, one per layer, ordered)
--
-- A two-layer tray is therefore three photos: the label and both layers.
--
-- The reference state is the moment of intake, before anything is removed, so
-- as_received defaults true. Photos taken later (a tray repacked mid-case, a
-- damaged slot) can be stored alongside without being mistaken for the layout
-- that has to be restored.
--
-- One table serves both kinds of thing a rep hauls: loaner totes, which are
-- inventory_items, and the reusable KA One / revision sets in tracked_assets.
-- Exactly one owner column is set per row.
--
-- Photos live in the existing public 'item-photos' bucket (migration 008);
-- this table only stores the resulting public URL.

create table if not exists asset_photos (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),

  inventory_item_id uuid references inventory_items (id) on delete cascade,
  tracked_asset_id uuid references tracked_assets (id) on delete cascade,

  kind text not null check (kind in ('label', 'layer')),
  -- 1-based, and only meaningful for a layer. Layer 1 is the top layer, the
  -- one you see when you open the lid -- matching tote_template_items.pack_layer.
  layer_index int check (layer_index is null or layer_index >= 1),

  url text not null,
  caption text,
  as_received boolean not null default true,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now(),

  -- Exactly one owner: a photo is of a loaner tote or of a tracked asset.
  constraint asset_photos_one_owner
    check (num_nonnulls(inventory_item_id, tracked_asset_id) = 1),

  -- A layer photo carries its layer number; a label photo does not.
  constraint asset_photos_layer_index_matches_kind
    check ((kind = 'layer') = (layer_index is not null))
);

create index if not exists asset_photos_item_idx
  on asset_photos (inventory_item_id, kind, layer_index);
create index if not exists asset_photos_asset_idx
  on asset_photos (tracked_asset_id, kind, layer_index);

alter table asset_photos enable row level security;

-- Trays are shared equipment, so visibility is the whole territory rather than
-- one owner. Anyone who might have to repack it needs to see how it arrived.
drop policy if exists asset_photos_select on asset_photos;
create policy asset_photos_select on asset_photos for select
  using (territory_id = my_territory_id());

drop policy if exists asset_photos_insert on asset_photos;
create policy asset_photos_insert on asset_photos for insert
  with check (territory_id = my_territory_id());

drop policy if exists asset_photos_update on asset_photos;
create policy asset_photos_update on asset_photos for update
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

-- Only whoever took it can remove it, matching task_photos.
drop policy if exists asset_photos_delete on asset_photos;
create policy asset_photos_delete on asset_photos for delete
  using (territory_id = my_territory_id() and uploaded_by = auth.uid());

grant select, insert, update, delete on asset_photos to authenticated;
