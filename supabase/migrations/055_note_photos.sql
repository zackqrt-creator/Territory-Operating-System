-- Photos on a territory note, mirroring task_photos (migration 046) rather
-- than a single photo_url column, since a note can carry more than one shot
-- (a tray, then a label, then a shelf) and the task version already proved
-- that shape out.
--
-- Photos live in the existing public 'item-photos' storage bucket (migration
-- 008); this table only stores the resulting public URL.

create table if not exists note_photos (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  note_id uuid not null references territory_notes (id) on delete cascade,
  url text not null,
  caption text,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists note_photos_note_idx on note_photos (note_id, created_at);

alter table note_photos enable row level security;

-- Visibility follows the note itself (private notes only to their
-- owner/creator, same as territory_notes_select in migration 042).
drop policy if exists note_photos_select on note_photos;
create policy note_photos_select on note_photos for select
  using (
    territory_id = my_territory_id()
    and exists (
      select 1 from territory_notes n
      where n.id = note_photos.note_id
        and (n.visibility <> 'private' or n.owner_id = auth.uid() or n.created_by = auth.uid())
    )
  );

drop policy if exists note_photos_insert on note_photos;
create policy note_photos_insert on note_photos for insert
  with check (territory_id = my_territory_id());

drop policy if exists note_photos_delete on note_photos;
create policy note_photos_delete on note_photos for delete
  using (territory_id = my_territory_id() and uploaded_by = auth.uid());

grant select, insert, update, delete on note_photos to anon, authenticated;
