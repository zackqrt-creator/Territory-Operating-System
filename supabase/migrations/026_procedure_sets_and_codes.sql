-- Layer 1 (Standard Procedures = case_templates) and Layer 2 (Sets/Kits =
-- tote_templates) both gain a short code, matching what shows up on loaner
-- box labels in myOPS (e.g. "GSKAIMPL"). procedure_sets is the join table
-- that says which Sets compose which Procedure (Layer 1 <-> Layer 2).
-- Layer 3 (packing list line items) already exists as tote_template_items.

alter table tote_templates add column if not exists code text;
alter table tote_templates add column if not exists content_type text
  check (content_type in ('implants', 'instruments', 'mixed'));
create index if not exists tote_templates_code_idx on tote_templates (territory_id, code);

alter table case_templates add column if not exists code text;

create table if not exists procedure_sets (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  case_template_id uuid not null references case_templates (id) on delete cascade,
  tote_template_id uuid not null references tote_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_template_id, tote_template_id)
);
create index if not exists procedure_sets_case_idx on procedure_sets (case_template_id);

alter table procedure_sets enable row level security;
drop policy if exists procedure_sets_all on procedure_sets;
create policy procedure_sets_all on procedure_sets for all
  using (territory_id = my_territory_id()) with check (territory_id = my_territory_id());
grant select, insert, update, delete on procedure_sets to anon, authenticated;
