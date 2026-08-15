-- Photo attachments on notes and tasks, reusing the existing public
-- item-photos bucket/RLS (migration 008) rather than standing up a second
-- bucket for the same thing.

alter table entity_notes add column if not exists photo_url text;
alter table tasks add column if not exists photo_url text;
