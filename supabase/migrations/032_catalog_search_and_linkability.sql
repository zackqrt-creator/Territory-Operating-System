-- Catalog module readiness: fast search + future linkability from notes/tasks.
-- No new features here -- just making sure catalog_items/tote_templates/
-- case_templates are searchable now and won't need a schema change later
-- when notes and tasks are built and want to attach to a catalog row.

create extension if not exists pg_trgm;

-- item_number lookups happen on every catalog load (exact match today,
-- partial match once search UI exists); name search is the "find this
-- product" case. Both trigram-indexed for fast ILIKE '%term%'.
create index if not exists catalog_items_item_number_idx
  on catalog_items (territory_id, item_number);
create index if not exists catalog_items_name_trgm_idx
  on catalog_items using gin (name gin_trgm_ops);
create index if not exists catalog_items_item_number_trgm_idx
  on catalog_items using gin (item_number gin_trgm_ops);

create index if not exists tote_templates_name_trgm_idx
  on tote_templates using gin (name gin_trgm_ops);
create index if not exists case_templates_name_trgm_idx
  on case_templates using gin (name gin_trgm_ops);

-- entity_notes already supports polymorphic (entity_type, entity_id)
-- attachments for case/inventory_item/surgeon/facility. Extend it to the
-- three catalog-module entities so a future notes UI can attach to a
-- specific implant/tray, Set, or Procedure without another migration.
alter table entity_notes drop constraint if exists entity_notes_entity_type_check;
alter table entity_notes add constraint entity_notes_entity_type_check
  check (entity_type in ('case', 'inventory_item', 'surgeon', 'facility', 'catalog_item', 'tote_template', 'case_template'));
