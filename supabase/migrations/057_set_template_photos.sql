-- Lets a Set/Tote *template* (tote_templates — "Left Full Tote", the
-- definition, not one physical instance) own asset_photos rows too.
--
-- Migration 049's own comment already ties layer_index to
-- tote_template_items.pack_layer, so a template-level reference photo was
-- clearly intended from the start; it just was never wired up. A physical
-- tray's as-received photos (inventory_items / tracked_assets) answer "how
-- do I repack the one in my hands"; a template's photos answer "what does a
-- correct one look like at all" — a reference for anyone building or
-- checking one from scratch, not tied to any single physical unit.

alter table asset_photos add column if not exists tote_template_id uuid references tote_templates (id) on delete cascade;

alter table asset_photos drop constraint if exists asset_photos_one_owner;
alter table asset_photos add constraint asset_photos_one_owner
  check (num_nonnulls(inventory_item_id, tracked_asset_id, tote_template_id) = 1);

create index if not exists asset_photos_tote_template_idx
  on asset_photos (tote_template_id, kind, layer_index);
