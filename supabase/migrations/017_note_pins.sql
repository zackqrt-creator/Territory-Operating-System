-- Pinned notes: one tap floats the note that never changes ("ALWAYS bring
-- extra 13mm inserts here") to the top of its thread. Pinning rides the
-- existing author-only update policy — you pin your own notes.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'entity_notes' and column_name = 'pinned'
  ) then
    alter table entity_notes add column pinned boolean not null default false;
  end if;
end $$;
