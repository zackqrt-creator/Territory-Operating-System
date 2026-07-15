-- Splits the single generic "KA One Instrument Tray" into individually
-- tracked trays, since loaners for one specific tray sometimes come in and
-- go back separately from the rest of the set. Also adds Dr. Neophil
-- (Lodi Memorial) as a surgeon record so preference/context notes can be
-- added for him without another migration -- see the new /surgeons page.
--
-- Tray names below are INFERRED from tray photos (a cutting/alignment
-- tray, a spacer-block tray, a drill/cut-block tray), not official names
-- off a label -- rename them in Supabase's Table Editor -> catalog_items
-- once you have the real ones.

do $$
declare
  t_id uuid;
  instrument_tote_id uuid;
  old_tray_id uuid;
  tray1_id uuid;
  tray2_id uuid;
  tray3_id uuid;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    raise notice 'No territory found -- run 001_initial_schema.sql first.';
    return;
  end if;

  select id into instrument_tote_id from tote_templates where territory_id = t_id and name = 'KA One Instrument Tray';
  if instrument_tote_id is null then
    raise notice 'KA One Instrument Tray tote not found -- run 005_seed_surgeon_bom_example.sql first.';
    return;
  end if;

  -- Remove the old single generic tray line/catalog item.
  select id into old_tray_id from catalog_items
    where territory_id = t_id and name = 'KA One Instrument Tray' and side = 'NA';
  if old_tray_id is not null then
    delete from tote_template_items where tote_template_id = instrument_tote_id and catalog_item_id = old_tray_id;
    delete from catalog_items where id = old_tray_id;
  end if;

  -- Three individually-tracked trays that normally travel as a set.
  select id into tray1_id from catalog_items where territory_id = t_id and name = 'KA One Cutting & Alignment Tray';
  if tray1_id is null then
    insert into catalog_items (territory_id, name, category, product_line, side, size_label)
    values (t_id, 'KA One Cutting & Alignment Tray', 'instrument_tray', 'KA One', 'NA', null)
    returning id into tray1_id;
  end if;

  select id into tray2_id from catalog_items where territory_id = t_id and name = 'KA One Sizing & Spacer Block Tray';
  if tray2_id is null then
    insert into catalog_items (territory_id, name, category, product_line, side, size_label)
    values (t_id, 'KA One Sizing & Spacer Block Tray', 'instrument_tray', 'KA One', 'NA', null)
    returning id into tray2_id;
  end if;

  select id into tray3_id from catalog_items where territory_id = t_id and name = 'KA One Drill & Cut Block Tray';
  if tray3_id is null then
    insert into catalog_items (territory_id, name, category, product_line, side, size_label)
    values (t_id, 'KA One Drill & Cut Block Tray', 'instrument_tray', 'KA One', 'NA', null)
    returning id into tray3_id;
  end if;

  insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
    select instrument_tote_id, tray1_id, 1
    where not exists (select 1 from tote_template_items where tote_template_id = instrument_tote_id and catalog_item_id = tray1_id);
  insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
    select instrument_tote_id, tray2_id, 1
    where not exists (select 1 from tote_template_items where tote_template_id = instrument_tote_id and catalog_item_id = tray2_id);
  insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
    select instrument_tote_id, tray3_id, 1
    where not exists (select 1 from tote_template_items where tote_template_id = instrument_tote_id and catalog_item_id = tray3_id);

  -- Dr. Neophil, Lodi Memorial -- no preferences or context yet, add via /surgeons.
  if not exists (select 1 from surgeons where territory_id = t_id and name = 'Dr. Neophil') then
    insert into surgeons (territory_id, name, notes)
    values (t_id, 'Dr. Neophil', 'Lodi Memorial. Preferences and context not yet added.');
  end if;
end $$;
