-- Foundation for "total inventory / where is it / do I have enough / how to
-- source a shortfall", plus the consignment-vs-loaner tracking model.
--
-- 1. Real facilities (replaces the demo ones) with a sourcing_priority so the
--    readiness engine knows what to recommend pulling from first. Lodi is the
--    rarely-touched reserve -- alert_on_withdrawal + the highest priority
--    number so it's the last owned location the app ever suggests.
--
-- 2. inventory_items gains:
--    - acquisition_type: 'consignment' | 'loaner' (tracked differently).
--    - loaner_tote_id: a loaner tote is itself an inventory row; its contents
--      are inventory rows pointing back at it via this self-FK, each linked to
--      a catalog_item so they roll into per-size/side totals right alongside
--      consignment.
--    - loaner_code / contents_label: the outer code on a tote (e.g. SPKAEFFR08)
--      and the inner meaning (e.g. "Ins-Spherika Efficiency Right").
--    - cement_type: per-unit Cemented/Cementless toggle for femurs (same size
--      femur ships both ways; tracked as an attribute, not a separate SKU).
--
-- 3. Backfills the tibial-insert item_numbers with the REAL derived REF, now
--    that the label pattern is confirmed from photos:
--    02.12.E0{size}{height}F{side}  (e.g. size 3 / 14mm / Left = 02.12.E0314FL,
--    size 2 / 10mm / Right = 02.12.E0210FR -- both seen on your labels).

alter table facilities
  add column if not exists sourcing_priority int not null default 50;

do $$
declare
  t_id uuid;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    raise notice 'No territory found -- run 001_initial_schema.sql first.';
    return;
  end if;

  -- Rename the demo storage facilities to the real ones (keeps their IDs, so
  -- any inventory already pointing at them stays valid).
  update facilities set name = 'Elk Grove Storage', type = 'storage', sourcing_priority = 1
    where territory_id = t_id and name = 'Storage Facility A';
  update facilities set name = 'Adventist Memorial Hospital', type = 'hospital', sourcing_priority = 2
    where territory_id = t_id and name = 'Storage Facility B';
  update facilities set sourcing_priority = 3
    where territory_id = t_id and name = 'Vehicle';
  update facilities set sourcing_priority = 99
    where territory_id = t_id and name = 'Corporate';

  -- Lodi reserve: highest owned-location priority number (suggested last) and
  -- flagged so any withdrawal shows red across the app until replenished.
  if not exists (select 1 from facilities where territory_id = t_id and name = 'Lodi Reserve') then
    insert into facilities (territory_id, name, type, alert_on_withdrawal, sourcing_priority)
    values (t_id, 'Lodi Reserve', 'storage', true, 90);
  else
    update facilities set alert_on_withdrawal = true, sourcing_priority = 90
      where territory_id = t_id and name = 'Lodi Reserve';
  end if;
end $$;

alter table inventory_items
  add column if not exists acquisition_type text not null default 'consignment'
    check (acquisition_type in ('consignment', 'loaner'));

alter table inventory_items
  add column if not exists loaner_tote_id uuid references inventory_items (id) on delete set null;

alter table inventory_items
  add column if not exists loaner_code text;

alter table inventory_items
  add column if not exists contents_label text;

alter table inventory_items
  add column if not exists cement_type text check (cement_type in ('cemented', 'cementless'));

create index if not exists inventory_items_loaner_tote_idx on inventory_items (loaner_tote_id);
create index if not exists inventory_items_catalog_idx on inventory_items (catalog_item_id);

-- Backfill real insert REFs from the confirmed label pattern.
do $$
declare
  t_id uuid;
  rec record;
  parts text[];
  sz text;
  th text;
  side_letter text;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then return; end if;

  for rec in
    select id, size_label, side from catalog_items
    where territory_id = t_id
      and name = 'GMK Sphere Primary Tibial Insert'
      and item_number is null
      and size_label like '% · %mm'
  loop
    -- size_label looks like "3 · 14mm"
    parts := string_to_array(rec.size_label, ' · ');
    sz := parts[1];
    th := replace(parts[2], 'mm', '');
    side_letter := case when rec.side = 'LEFT' then 'L' when rec.side = 'RIGHT' then 'R' else null end;
    if side_letter is not null and sz ~ '^[0-9]$' and th ~ '^[0-9]{2}$' then
      update catalog_items
        set item_number = '02.12.E0' || sz || th || 'F' || side_letter
        where id = rec.id;
    end if;
  end loop;
end $$;
