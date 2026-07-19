-- Regional managers' inventory locations. Exact addresses unknown -- names
-- are editable in-app (Compliance -> Locations) so Matt/Karl can correct
-- them without a migration. Priority 50: suggested after your own storage,
-- before Lodi reserve.
do $$
declare
  t_id uuid;
  n text;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then return; end if;
  foreach n in array array['Matt Inventory (RM)', 'Karl Inventory (RM)']
  loop
    if not exists (select 1 from facilities where territory_id = t_id and name = n) then
      insert into facilities (territory_id, name, type, sourcing_priority)
      values (t_id, n, 'storage', 50);
    end if;
  end loop;
end $$;
