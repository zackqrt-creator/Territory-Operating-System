-- ============================================================================
-- 047: let a rep correct the movement log.
--
-- Migration 001 gave `movements` only select + insert policies, on the theory
-- that a log should be append-only. In practice a mis-scan writes a move
-- against the wrong item, or a drop-off gets logged at the wrong facility, and
-- the false entry then sits in the activity feed permanently -- which makes the
-- whole feed less trustworthy, not more.
--
-- Deleting a movement row does NOT move the item back; that stays a separate,
-- deliberate action. This only lets the record be corrected.
-- ============================================================================

drop policy if exists movements_update on movements;
create policy movements_update on movements for update
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists movements_delete on movements;
create policy movements_delete on movements for delete
  using (territory_id = my_territory_id());
