-- Adds HIP as a valid cases.surgery_type and a variant column (total/partial)
-- so a case can be matched to the right case_template for the readiness
-- checklist. Run this in the Supabase SQL editor if you already ran the
-- original schema.sql. Safe to re-run.

do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'cases'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%surgery_type%';
  if con is not null then
    execute format('alter table cases drop constraint %I', con);
  end if;
end $$;

alter table cases
  add constraint cases_surgery_type_check
  check (surgery_type in ('KNEE', 'HIP', 'INSTRUMENT'));

alter table cases
  add column if not exists variant text check (variant in ('total', 'partial')) default 'total';
