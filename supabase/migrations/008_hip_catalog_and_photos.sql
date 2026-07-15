-- Groundwork for tomorrow's hip inventory scan-in:
--
-- 1. catalog_items gets a `joint` column (KNEE/HIP/NA) and a `device_type`
--    column (free text, e.g. "Femoral Stem", "Acetabular Cup", "Bone
--    Cement") so hip devices can be organized under a "Hips" heading,
--    broken down by device, the same way the knee catalog already is by
--    product line. Existing rows default to 'KNEE' since that's everything
--    seeded so far; device_type is backfilled by name pattern where it's
--    unambiguous.
--
-- 2. inventory_items gets a `photo_url` column so a physical item can carry
--    a reference photo -- the fast path for tomorrow's hip scan-in is:
--    snap a photo, pick (or create) the matching catalog device, done. No
--    hip catalog_items are seeded here -- which specific stems/cups/liners
--    you actually stock is still unconfirmed (Medacta's public hip lineup
--    alone spans 5+ stem systems), so seeding placeholders would recreate
--    exactly the false-readiness risk this app has avoided everywhere
--    else. Add real hip catalog entries as you scan items in tomorrow (the
--    app now supports creating a new catalog entry inline when no match
--    exists), or send me photos/specs and I'll seed a migration instead.
--
-- 3. A public Storage bucket for those photos, with authenticated write.

alter table catalog_items
  add column if not exists joint text not null default 'KNEE' check (joint in ('KNEE', 'HIP', 'NA'));

alter table catalog_items
  add column if not exists device_type text;

update catalog_items set device_type = 'Femoral Component'
  where device_type is null and name ilike '%femur%';
update catalog_items set device_type = 'Tibial Tray'
  where device_type is null and name ilike '%tibial tray%';
update catalog_items set device_type = 'Tibial Insert'
  where device_type is null and name ilike '%insert%';
update catalog_items set device_type = 'Patella'
  where device_type is null and (name ilike '%motopat%' or name ilike '%patella%');
update catalog_items set device_type = 'Instrument Tray'
  where device_type is null and category = 'instrument_tray';

alter table inventory_items
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
  values ('item-photos', 'item-photos', true)
  on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_photos_read'
  ) then
    create policy item_photos_read on storage.objects for select
      using (bucket_id = 'item-photos');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_photos_write'
  ) then
    create policy item_photos_write on storage.objects for insert
      with check (bucket_id = 'item-photos' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_photos_delete'
  ) then
    create policy item_photos_delete on storage.objects for delete
      using (bucket_id = 'item-photos' and auth.role() = 'authenticated');
  end if;
end $$;
