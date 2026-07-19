-- CRM foundation: case readiness scoring inputs, preference-card plans,
-- Q&A wall, credentialing, and the billing pipeline. All additive.

-- Cases: who's covering it, and the money trail.
alter table cases add column if not exists assigned_rep_id uuid references profiles (id);
alter table cases add column if not exists purchase_order_no text;
alter table cases add column if not exists invoice_no text;
alter table cases add column if not exists billing_status text not null default 'none'
  check (billing_status in ('none', 'awaiting_po', 'po_received', 'invoiced', 'paid'));

-- Rep certifications (product/system training). Missing = "not tracked", never a fake pass.
create table if not exists rep_certifications (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  profile_id uuid not null references profiles (id),
  name text not null,
  issued_on date,
  expires_on date,
  created_at timestamptz not null default now()
);

-- Instrument-tray sterilization + inbound loaner delivery tracking.
alter table inventory_items add column if not exists sterilization_status text not null default 'unknown'
  check (sterilization_status in ('sterile', 'processing', 'expired', 'unknown'));
alter table inventory_items add column if not exists sterilization_expires_at date;
alter table inventory_items add column if not exists delivery_status text
  check (delivery_status in ('ordered', 'in_transit', 'delivered'));
alter table inventory_items add column if not exists expected_delivery_date date;

-- Preference-card output: the per-case item plan the rep accepted/edited.
create table if not exists case_item_plans (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  case_id uuid not null references cases (id) on delete cascade,
  name text not null,
  category text not null check (category in ('loaner_kit', 'instrument_tray', 'implant', 'consumable')),
  quantity int not null default 1,
  source text not null default 'suggested' check (source in ('suggested', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists case_item_plans_case_idx on case_item_plans (case_id);

-- Q&A wall with contextual pins (product line, surgeon, procedure).
create table if not exists qa_questions (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  author_id uuid references profiles (id),
  body text not null,
  pinned_product text,
  pinned_surgeon_id uuid references surgeons (id),
  pinned_surgery_type text check (pinned_surgery_type in ('KNEE', 'HIP')),
  created_at timestamptz not null default now()
);
create table if not exists qa_answers (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  question_id uuid not null references qa_questions (id) on delete cascade,
  author_id uuid references profiles (id),
  body text not null,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qa_answers_question_idx on qa_answers (question_id);

-- Facility credentialing (RepTrax/Symplr etc.) per rep per facility.
create table if not exists facility_credentials (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  profile_id uuid not null references profiles (id),
  facility_id uuid not null references facilities (id),
  vendor text not null,
  expires_on date not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['rep_certifications', 'case_item_plans', 'qa_questions', 'qa_answers', 'facility_credentials']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all using (territory_id = my_territory_id()) with check (territory_id = my_territory_id())',
      t, t);
  end loop;
end $$;
