-- Corrects the placeholder product-line names from migration 005 to the
-- real brands (confirmed from photos of actual GMK boxes), adds Right-side
-- catalog items so Right-side cases resolve against Dr. Sidhu's preference
-- automatically (tote templates stay Left-only -- see resolveForSide() in
-- src/lib/packlist.ts), expands tibial inserts from a flat size 1-6 list
-- to real size x thickness combinations, and adds a pack_layer so the pack
-- list can display items in the order they're physically packed.
--
-- What's derived vs. confirmed:
--   - Femur and tibial tray item_numbers follow a clean, consistently
--     photographed REF pattern (e.g. 02.12.KA0{size}R / KA1{size}R for the
--     "+" sizes). Right-side REFs are directly from photos; Left-side REFs
--     are DERIVED by mirroring the R/L suffix (standard in this industry,
--     but not itself photographed) -- spot check if you rely on them.
--   - Insert and patella item_numbers are left NULL. Their REF codes don't
--     obviously encode side the same way, and getting that wrong is worse
--     than leaving it blank -- matching in the app is by name/size, not
--     item_number, so this doesn't affect the pack list's accuracy.
--   - Size "1" femur is kept in the catalog on both sides (you said it's
--     being phased out but still used occasionally) -- expect it to often
--     show 0 on hand, which is the correct signal, not a bug.

do $$
declare
  t_id uuid;
  complete_tote_id uuid;
  sz text;
  th text;
  ref_suffix text;
  ref_prefix text;
  insert_id uuid;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    raise notice 'No territory found -- run 001_initial_schema.sql first.';
    return;
  end if;

  select id into complete_tote_id from tote_templates where territory_id = t_id and name = 'KA One Complete Tote';
  if complete_tote_id is null then
    raise notice 'KA One Complete Tote not found -- run 005_seed_surgeon_bom_example.sql first.';
    return;
  end if;

  -- Layer ordering support.
  alter table tote_template_items add column if not exists pack_layer int;

  -- Correct placeholder product-line names/naming to the real brands.
  update catalog_items set name = 'GMK Spherika Femoral Component', product_line = 'GMK Spherika'
    where territory_id = t_id and name = 'KA One Femoral Component';
  update catalog_items set name = 'GMK Primary Tibial Tray', product_line = 'GMK Primary'
    where territory_id = t_id and name = 'KA One Tibial Component';
  update catalog_items set name = 'GMK Sphere Primary Tibial Insert', product_line = 'GMK Sphere Primary E-Cross'
    where territory_id = t_id and name = 'KA One Insert';
  update catalog_items set name = 'Moto PFJ Patella Resurfacing', product_line = 'Moto PFJ'
    where territory_id = t_id and name = 'Motopat Patella Component';

  -- Layer 1: femurs (except size 7) + all tibial trays.
  update tote_template_items tti
  set pack_layer = 1
  from catalog_items ci
  where tti.catalog_item_id = ci.id
    and ci.territory_id = t_id
    and (
      (ci.name = 'GMK Spherika Femoral Component' and ci.size_label <> '7')
      or ci.name = 'GMK Primary Tibial Tray'
    );

  -- Layer 3: femur size 7, patella, fixation hardware.
  update tote_template_items tti
  set pack_layer = 3
  from catalog_items ci
  where tti.catalog_item_id = ci.id
    and ci.territory_id = t_id
    and (
      (ci.name = 'GMK Spherika Femoral Component' and ci.size_label = '7')
      or ci.name = 'Moto PFJ Patella Resurfacing'
      or ci.name in ('Screws', 'Sword Pins', 'Threaded Smooth', 'Efficiency Shims')
    );

  -- Femurs: derive Left item_numbers, add Right catalog items (both sides,
  -- all 13 sizes -- tote templates stay Left-only, Right resolves automatically).
  foreach sz in array array['1', '1+', '2', '2+', '3', '3+', '4', '4+', '5', '5+', '6', '6+', '7']
  loop
    if right(sz, 1) = '+' then
      ref_suffix := '1' || left(sz, length(sz) - 1);
    else
      ref_suffix := '0' || sz;
    end if;

    update catalog_items set item_number = '02.12.KA' || ref_suffix || 'L'
      where territory_id = t_id and name = 'GMK Spherika Femoral Component' and side = 'LEFT'
        and size_label = sz and item_number is null;

    if not exists (
      select 1 from catalog_items
      where territory_id = t_id and name = 'GMK Spherika Femoral Component' and side = 'RIGHT' and size_label = sz
    ) then
      insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
      values (t_id, '02.12.KA' || ref_suffix || 'R', 'GMK Spherika Femoral Component', 'implant', 'GMK Spherika', 'RIGHT', sz);
    end if;
  end loop;

  -- Tibial trays: same idea. T3i4/T4i3 and "5+" use irregular REF suffixes.
  foreach sz in array array['1', '2', '3', 'T3i4', 'T4i3', '4', '5', '5+', '6']
  loop
    if sz = 'T3i4' then
      ref_prefix := '02.12.'; ref_suffix := 'T3I4';
    elsif sz = 'T4i3' then
      ref_prefix := '02.12.'; ref_suffix := 'T4I3';
    elsif sz = '5+' then
      ref_prefix := '02.07.'; ref_suffix := '12055';
    else
      ref_prefix := '02.07.'; ref_suffix := '120' || sz;
    end if;

    update catalog_items set item_number = ref_prefix || ref_suffix || 'L'
      where territory_id = t_id and name = 'GMK Primary Tibial Tray' and side = 'LEFT'
        and size_label = sz and item_number is null;

    if not exists (
      select 1 from catalog_items
      where territory_id = t_id and name = 'GMK Primary Tibial Tray' and side = 'RIGHT' and size_label = sz
    ) then
      insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
      values (t_id, ref_prefix || ref_suffix || 'R', 'GMK Primary Tibial Tray', 'implant', 'GMK Primary', 'RIGHT', sz);
    end if;
  end loop;

  -- Inserts: replace the flat "one per size" placeholder with real
  -- size x thickness combinations (10/11/12/13/14/17/20mm per size),
  -- confirmed by photos for sizes 2-6 at 10-14mm; the wider 17/20mm range
  -- is carried over from your very first description and the size-1/2
  -- photo that showed those thicknesses too. Extra combinations that
  -- aren't really stocked just show 0 on hand -- safer than silently
  -- excluding a real one.
  delete from tote_template_items
    where catalog_item_id in (
      select id from catalog_items
      where territory_id = t_id and name = 'GMK Sphere Primary Tibial Insert' and side = 'LEFT'
        and size_label in ('1', '2', '3', '4', '5', '6')
    );
  delete from catalog_items
    where territory_id = t_id and name = 'GMK Sphere Primary Tibial Insert' and side = 'LEFT'
      and size_label in ('1', '2', '3', '4', '5', '6');

  foreach sz in array array['1', '2', '3', '4', '5', '6']
  loop
    foreach th in array array['10', '11', '12', '13', '14', '17', '20']
    loop
      select id into insert_id from catalog_items
        where territory_id = t_id and name = 'GMK Sphere Primary Tibial Insert' and side = 'LEFT'
          and size_label = sz || ' · ' || th || 'mm';
      if insert_id is null then
        insert into catalog_items (territory_id, name, category, product_line, side, size_label)
        values (t_id, 'GMK Sphere Primary Tibial Insert', 'implant', 'GMK Sphere Primary E-Cross', 'LEFT', sz || ' · ' || th || 'mm')
        returning id into insert_id;
      end if;
      insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote, pack_layer)
        select complete_tote_id, insert_id, 1, 2
        where not exists (
          select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = insert_id
        );

      if not exists (
        select 1 from catalog_items
        where territory_id = t_id and name = 'GMK Sphere Primary Tibial Insert' and side = 'RIGHT'
          and size_label = sz || ' · ' || th || 'mm'
      ) then
        insert into catalog_items (territory_id, name, category, product_line, side, size_label)
        values (t_id, 'GMK Sphere Primary Tibial Insert', 'implant', 'GMK Sphere Primary E-Cross', 'RIGHT', sz || ' · ' || th || 'mm');
      end if;
    end loop;
  end loop;

  update surgeons set notes = notes || ' KA One instrument set covers both Left and Right cases (confirmed from tray photos, no separate side-specific instrument tote needed).'
    where territory_id = t_id and name = 'Dr. Sidhu'
      and notes not like '%covers both Left and Right%';
end $$;
