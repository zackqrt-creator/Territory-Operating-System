-- myOPS sometimes lists the same physical case under a shorter name
-- (e.g. "500 Sphere Left Case" vs "500 Sphere KA Left Case" -- identical
-- Set composition, same KA technique, just an inconsistent procedure
-- label in myOPS). alt_name lets one case_templates row match either
-- name in search, instead of creating a duplicate Procedure.

alter table case_templates add column if not exists alt_name text;

create index if not exists case_templates_alt_name_trgm_idx
  on case_templates using gin (alt_name gin_trgm_ops);

update case_templates set alt_name = '500 Sphere Left Case'
where code = '500 Sphere KA Left Case'
  and alt_name is distinct from '500 Sphere Left Case';
