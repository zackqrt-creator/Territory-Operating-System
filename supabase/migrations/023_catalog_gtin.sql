-- ============================================================================
-- GTIN on catalog items — what a barcode scan actually decodes.
--
-- REF (item_number) identifies a product on the printed label and OCR reads
-- it fine, but a GS1 data-matrix barcode encodes the GTIN (AI 01), not the
-- REF. Without a GTIN column there's no way to go from "scanned this
-- barcode" to "this is a GMK Spherika Femoral, size 4+, right, cemented" —
-- the batch scanner has to ask the rep every single time.
--
-- Left nullable and mostly empty at first; the app backfills it the first
-- time a rep manually matches a scanned GTIN to a catalog item, so the
-- catalog "learns" barcodes over time instead of needing a bulk import.
-- ============================================================================

alter table catalog_items add column if not exists gtin text;

create index if not exists catalog_items_gtin_idx
  on catalog_items (territory_id, gtin)
  where gtin is not null;
