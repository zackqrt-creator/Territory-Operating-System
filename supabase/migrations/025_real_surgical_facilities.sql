-- ============================================================================
-- The real surgical facility set.
--
-- "Adventist Memorial Hospital" was a placeholder from migration 009 that
-- never got corrected to a real name. Renaming (not deleting) it keeps its
-- id, so any case/inventory row already pointing at it stays valid. The
-- other four real sites never existed as rows at all.
-- ============================================================================

do $$
declare
  t_id uuid;
begin
  select id into t_id from territories order by created_at limit 1;
  if t_id is null then return; end if;

  update facilities set name = 'Lodi Memorial Hospital', type = 'hospital'
    where territory_id = t_id and name = 'Adventist Memorial Hospital';

  insert into facilities (territory_id, name, type, sourcing_priority)
    select t_id, 'Lodi Surgery Center', 'surgery_center', 2
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Lodi Surgery Center');

  insert into facilities (territory_id, name, type, sourcing_priority)
    select t_id, 'San Joaquin General Hospital', 'hospital', 2
    where not exists (select 1 from facilities where territory_id = t_id and name = 'San Joaquin General Hospital');

  insert into facilities (territory_id, name, type, sourcing_priority)
    select t_id, 'Saint Josephs Medical Center', 'hospital', 2
    where not exists (select 1 from facilities where territory_id = t_id and name = 'Saint Josephs Medical Center');

  insert into facilities (territory_id, name, type, sourcing_priority)
    select t_id, 'ASC- Stockton', 'surgery_center', 2
    where not exists (select 1 from facilities where territory_id = t_id and name = 'ASC- Stockton');
end $$;
