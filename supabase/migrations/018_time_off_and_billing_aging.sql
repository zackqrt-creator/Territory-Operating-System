-- Two additions:
--
-- 1. rep_time_off — block-out days. Everyone can see who's out (coverage
--    planning is a team problem); you can only create/delete your own.
--
-- 2. cases.billing_updated_at — stamped every time the billing stage moves,
--    so the pipeline can show honest "sitting in Awaiting PO for 18 days"
--    aging. Existing rows start null (no fake ages), and the first stage
--    change starts the clock.

create table if not exists rep_time_off (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  rep_id uuid not null references profiles (id),
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists rep_time_off_range_idx on rep_time_off (territory_id, start_date, end_date);

alter table rep_time_off enable row level security;

drop policy if exists rep_time_off_select on rep_time_off;
create policy rep_time_off_select on rep_time_off for select
  using (territory_id = my_territory_id());

drop policy if exists rep_time_off_insert on rep_time_off;
create policy rep_time_off_insert on rep_time_off for insert
  with check (territory_id = my_territory_id() and rep_id = auth.uid());

drop policy if exists rep_time_off_delete on rep_time_off;
create policy rep_time_off_delete on rep_time_off for delete
  using (rep_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'cases' and column_name = 'billing_updated_at'
  ) then
    alter table cases add column billing_updated_at timestamptz;
  end if;
end $$;
