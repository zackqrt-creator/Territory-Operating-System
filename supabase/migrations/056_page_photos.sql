-- Photos on a Knowledge page, mirroring note_photos (migration 055) and
-- task_photos (migration 046) — pages had no photo capability at all until
-- now, even though notes and tasks both already did.

create table if not exists page_photos (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  page_id uuid not null references pages (id) on delete cascade,
  url text not null,
  caption text,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists page_photos_page_idx on page_photos (page_id, created_at);

alter table page_photos enable row level security;

-- Pages don't have a private/team visibility split like notes do (they're
-- always territory-wide), so this mirrors the plain pages_select policy.
drop policy if exists page_photos_select on page_photos;
create policy page_photos_select on page_photos for select
  using (territory_id = my_territory_id());

drop policy if exists page_photos_insert on page_photos;
create policy page_photos_insert on page_photos for insert
  with check (territory_id = my_territory_id());

drop policy if exists page_photos_delete on page_photos;
create policy page_photos_delete on page_photos for delete
  using (territory_id = my_territory_id());

grant select, insert, update, delete on page_photos to anon, authenticated;
