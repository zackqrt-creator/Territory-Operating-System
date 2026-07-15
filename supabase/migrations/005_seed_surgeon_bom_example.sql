-- Example/starter surgeon preference data for Dr. Sidhu, built from what
-- was described in chat. This is NOT fully verified — see README "A note
-- on the pack list seed data" for exactly what's solid vs. placeholder
-- before relying on this for a real case:
--
--   - Femur/tibia/insert/Motopat item_numbers are left NULL (none were
--     given for the size-run items) — the pack list still works correctly
--     without them (matching is by name/size, not item_number), but fill
--     in real catalog numbers when you have them, for your own reference.
--   - Only LEFT-side catalog items are seeded. Right-side cases won't
--     resolve against this preference until Right catalog items exist
--     with matching product_line/category/size_label — at that point the
--     pack list picks them up automatically, no template changes needed.
--   - The "KA One Instrument Tray" is a single generic line, not an
--     itemized tray breakdown (wasn't given) — fine for the reusable/
--     advisory tray-count feature, which only needs a count, not contents.
--   - The Partial Small Totes, both Revision totes, and the Spherika
--     Efficiency instrument tote are NOT seeded — their descriptions in
--     chat were ambiguous or incomplete. Tell me the missing pieces and
--     I'll add them.
--   - The 3 real loaner catalog items from your live example case
--     (SPKAEFFL, GSLVEMIC01, GSLVETGK18, GSTILVE38) are seeded standalone
--     for reference but NOT wired into a tote template, since their size
--     codes ("Micro S1", "17-20") don't obviously map to the tote's
--     generic "insert sizes 1-6" — that needs your confirmation before I
--     connect them.

do $$
declare
  t_id uuid;
  v_surgeon_id uuid;
  complete_tote_id uuid;
  full_tote_id uuid;
  instrument_tote_id uuid;
  instrument_tray_id uuid;
  femur_id uuid;
  tibia_id uuid;
  insert_id uuid;
  motopat_id uuid;
  extra_id uuid;
  sz text;
  extra_spec text;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then
    raise notice 'No territory found -- run 001_initial_schema.sql first.';
    return;
  end if;

  select id into v_surgeon_id from surgeons where territory_id = t_id and name = 'Dr. Sidhu';
  if v_surgeon_id is null then
    insert into surgeons (territory_id, name, notes)
    values (
      t_id, 'Dr. Sidhu',
      'Kinematic alignment. KA One instruments (occasionally Spherika Efficiency single-use). GMK Sphere Vit-E implants, cementless-leaning. Brings Motopat. Operates at St. Joseph''s Medical Center - Stockton and the Stockton ASC.'
    )
    returning id into v_surgeon_id;
  end if;

  select id into complete_tote_id from tote_templates where territory_id = t_id and name = 'KA One Complete Tote';
  if complete_tote_id is null then
    insert into tote_templates (territory_id, name, reusable, notes)
    values (t_id, 'KA One Complete Tote', false, 'Full size-run for one case. Item numbers are placeholders.')
    returning id into complete_tote_id;
  end if;

  select id into full_tote_id from tote_templates where territory_id = t_id and name = 'KA One Full Tote';
  if full_tote_id is null then
    insert into tote_templates (territory_id, name, reusable, notes)
    values (t_id, 'KA One Full Tote', false, 'Backup/supplementary size-run, narrower than Complete. Item numbers are placeholders.')
    returning id into full_tote_id;
  end if;

  select id into instrument_tote_id from tote_templates where territory_id = t_id and name = 'KA One Instrument Tray';
  if instrument_tote_id is null then
    insert into tote_templates (territory_id, name, reusable, advisory_cases_per_unit, notes)
    values (
      t_id, 'KA One Instrument Tray', true, 2,
      'Reusable between cases with normal sterile turnaround. ~1 tray per 2 same-day cases is the starting ratio -- tell me if that''s off.'
    )
    returning id into instrument_tote_id;
  end if;

  select id into instrument_tray_id from catalog_items
    where territory_id = t_id and name = 'KA One Instrument Tray' and side = 'NA';
  if instrument_tray_id is null then
    insert into catalog_items (territory_id, name, category, product_line, side, size_label)
    values (t_id, 'KA One Instrument Tray', 'instrument_tray', 'KA One', 'NA', null)
    returning id into instrument_tray_id;
  end if;
  insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
    select instrument_tote_id, instrument_tray_id, 1
    where not exists (
      select 1 from tote_template_items
      where tote_template_id = instrument_tote_id and catalog_item_id = instrument_tray_id
    );

  -- Femurs: Complete gets the full run; Full gets everything except plain "1".
  foreach sz in array array['1','1+','2','2+','3','3+','4','4+','5','5+','6','6+','7']
  loop
    select id into femur_id from catalog_items
      where territory_id = t_id and name = 'KA One Femoral Component' and side = 'LEFT' and size_label = sz;
    if femur_id is null then
      insert into catalog_items (territory_id, name, category, product_line, side, size_label)
      values (t_id, 'KA One Femoral Component', 'implant', 'KA One', 'LEFT', sz)
      returning id into femur_id;
    end if;

    insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
      select complete_tote_id, femur_id, 1
      where not exists (
        select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = femur_id
      );

    if sz <> '1' then
      insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
        select full_tote_id, femur_id, 1
        where not exists (
          select 1 from tote_template_items where tote_template_id = full_tote_id and catalog_item_id = femur_id
        );
    end if;
  end loop;

  -- Tibias: Complete gets 1,2,3,T3i4,T4i3,4,5,5+,6; Full gets the same minus "5+".
  foreach sz in array array['1','2','3','T3i4','T4i3','4','5','5+','6']
  loop
    select id into tibia_id from catalog_items
      where territory_id = t_id and name = 'KA One Tibial Component' and side = 'LEFT' and size_label = sz;
    if tibia_id is null then
      insert into catalog_items (territory_id, name, category, product_line, side, size_label)
      values (t_id, 'KA One Tibial Component', 'implant', 'KA One', 'LEFT', sz)
      returning id into tibia_id;
    end if;

    insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
      select complete_tote_id, tibia_id, 1
      where not exists (
        select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = tibia_id
      );

    if sz <> '5+' then
      insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
        select full_tote_id, tibia_id, 1
        where not exists (
          select 1 from tote_template_items where tote_template_id = full_tote_id and catalog_item_id = tibia_id
        );
    end if;
  end loop;

  -- Inserts: Complete tote only, sizes 1-6.
  foreach sz in array array['1','2','3','4','5','6']
  loop
    select id into insert_id from catalog_items
      where territory_id = t_id and name = 'KA One Insert' and side = 'LEFT' and size_label = sz;
    if insert_id is null then
      insert into catalog_items (territory_id, name, category, product_line, side, size_label)
      values (t_id, 'KA One Insert', 'implant', 'KA One', 'LEFT', sz)
      returning id into insert_id;
    end if;
    insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
      select complete_tote_id, insert_id, 1
      where not exists (
        select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = insert_id
      );
  end loop;

  -- Motopat: Complete tote only, sizes 1-6, qty 2 each.
  foreach sz in array array['1','2','3','4','5','6']
  loop
    select id into motopat_id from catalog_items
      where territory_id = t_id and name = 'Motopat Patella Component' and side = 'NA' and size_label = sz;
    if motopat_id is null then
      insert into catalog_items (territory_id, name, category, product_line, side, size_label)
      values (t_id, 'Motopat Patella Component', 'implant', 'Motopat', 'NA', sz)
      returning id into motopat_id;
    end if;
    insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
      select complete_tote_id, motopat_id, 2
      where not exists (
        select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = motopat_id
      );
  end loop;

  -- Extras: Complete tote only, unsized fixation hardware.
  foreach extra_spec in array array['Screws:2', 'Sword Pins:2', 'Threaded Smooth:2', 'Efficiency Shims:1']
  loop
    select id into extra_id from catalog_items
      where territory_id = t_id and name = split_part(extra_spec, ':', 1) and side = 'NA';
    if extra_id is null then
      insert into catalog_items (territory_id, name, category, product_line, side, size_label)
      values (t_id, split_part(extra_spec, ':', 1), 'consumable', 'KA One', 'NA', null)
      returning id into extra_id;
    end if;
    insert into tote_template_items (tote_template_id, catalog_item_id, quantity_per_tote)
      select complete_tote_id, extra_id, split_part(extra_spec, ':', 2)::int
      where not exists (
        select 1 from tote_template_items where tote_template_id = complete_tote_id and catalog_item_id = extra_id
      );
  end loop;

  if not exists (
    select 1 from surgeon_preferences
    where surgeon_id = v_surgeon_id and surgery_type = 'KNEE' and variant = 'total'
  ) then
    insert into surgeon_preferences (
      surgeon_id, territory_id, surgery_type, variant, alignment_technique, cement_type,
      instrument_tote_id, implant_tote_id, notes
    ) values (
      v_surgeon_id, t_id, 'KNEE', 'total', 'Kinematic', 'cementless',
      instrument_tote_id, complete_tote_id,
      'Sometimes uses Spherika Efficiency single-use instruments instead of KA One -- not yet modeled as an alternate.'
    );
  end if;

  -- Real loaner catalog items from the live example case -- standalone
  -- reference only, not wired into a tote (see header note above).
  insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
    select t_id, 'SPKAEFFL', 'Ins- Spherika Efficiency Left', 'instrument_tray', 'Spherika Efficiency', 'LEFT', null
    where not exists (select 1 from catalog_items where territory_id = t_id and item_number = 'SPKAEFFL');

  insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
    select t_id, 'GSLVEMIC01', 'GMK Sph Vit-E Insert Left Micro S1', 'implant', 'GMK Sphere Vit-E', 'LEFT', 'Micro S1'
    where not exists (select 1 from catalog_items where territory_id = t_id and item_number = 'GSLVEMIC01');

  insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
    select t_id, 'GSLVETGK18', 'GMK Sph Vit-E Rib Ins Left', 'implant', 'GMK Sphere Vit-E', 'LEFT', '17-20'
    where not exists (select 1 from catalog_items where territory_id = t_id and item_number = 'GSLVETGK18');

  insert into catalog_items (territory_id, item_number, name, category, product_line, side, size_label)
    select t_id, 'GSTILVE38', 'GMK Sph Vit-E Tib Insert Left', 'implant', 'GMK Sphere Vit-E', 'LEFT', '2-6, 10-14mm'
    where not exists (select 1 from catalog_items where territory_id = t_id and item_number = 'GSTILVE38');
end $$;
