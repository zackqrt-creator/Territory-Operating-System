-- Integration framework.
--
-- Plumbing only. No connector to any outside system is implemented here; this
-- is the shape every future one plugs into, so that adding myOPS, a calendar,
-- a shipment tracker or a document source is a connector plus a row, not a new
-- architecture each time.
--
-- WHERE SECRETS LIVE, AND WHY NOT HERE
--
-- Territory OS is a client-side PWA. Every VITE_ variable is compiled into the
-- bundle, and any row this app can read is a row a browser can read. So an API
-- token in `integrations.config` would be a published token, exactly the
-- mistake AGENTS.md records as one of the reasons the old prototype is dead.
--
-- Therefore: `config` holds NON-SECRET settings only -- an account id, a folder
-- name, a base URL, a toggle. The secret itself lives in Supabase's secret
-- store, the same place link-note keeps ANTHROPIC_API_KEY, and `credential_ref`
-- holds only the NAME of that secret. The browser can see that a provider is
-- configured; it can never see what with. A connector runs in an edge function,
-- reads the named secret from its own environment, and the client only ever
-- asks it to run and reads back what happened.
--
-- There is a check constraint below that refuses the most obvious ways of
-- getting this wrong. It is not a security boundary -- a determined caller can
-- name a key anything -- it is a tripwire for the honest mistake.

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),

  -- Stable machine name: 'myops', 'google_calendar', 'shipments', 'evernote',
  -- 'litmos'. Deliberately NOT a check constraint -- a new connector should not
  -- need a migration to exist, and an unknown provider simply has no connector
  -- registered, which surfaces as an honest error rather than a broken row.
  provider text not null,
  display_name text not null,

  enabled boolean not null default false,

  /*
   * Status is stored rather than derived because "never tried" and "tried and
   * failed" are different things to a rep looking at this screen, and a derived
   * view cannot tell them apart once last_error is cleared.
   */
  status text not null default 'not_configured'
    check (status in ('not_configured', 'connected', 'error', 'disabled')),

  -- NON-SECRET configuration only. See the header.
  config jsonb not null default '{}'::jsonb,
  -- The NAME of a Supabase secret, e.g. 'MYOPS_API_TOKEN'. Never the value.
  credential_ref text,

  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  -- Lets the UI say "failing since Tuesday" rather than only "failed", and
  -- gives a future scheduler something to back off on.
  consecutive_failures integer not null default 0,

  -- Where an incremental sync got to: a timestamp, a page token, a delta link.
  -- Shape is the connector's business.
  sync_cursor jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (territory_id, provider),

  -- Tripwire, not a lock: catches a token pasted into the wrong column.
  constraint integrations_credential_ref_is_a_name check (
    credential_ref is null or credential_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'
  )
);

create index if not exists integrations_territory_idx on integrations (territory_id, provider);

/*
 * Every attempt, successful or not.
 *
 * This is what makes "last successful sync", "currently syncing" and "errors
 * requiring attention" answerable without guessing, and it is the audit trail
 * for a system that will eventually be trusted to say "tomorrow's cases are
 * ready". A run row is written when the attempt STARTS, so a crash leaves a
 * visible 'running' row rather than silence.
 */
create table if not exists integration_runs (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  integration_id uuid not null references integrations (id) on delete cascade,

  kind text not null check (kind in ('test', 'sync', 'backfill')),
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'webhook')),

  status text not null default 'running'
    check (status in ('running', 'success', 'error', 'partial')),

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  -- Counts, so a sync that "worked" but changed nothing is distinguishable
  -- from one that quietly rewrote half the territory.
  items_seen integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_skipped integer not null default 0,

  error_message text,
  error_detail jsonb,
  -- Connector-specific extras worth showing a human.
  summary jsonb,

  created_by uuid references profiles (id)
);

create index if not exists integration_runs_recent_idx
  on integration_runs (integration_id, started_at desc);

/*
 * The map between an outside system's ids and ours.
 *
 * This is the part that makes syncing safe, and the reason this framework is
 * three tables rather than two. Without it, every re-sync is a fresh import:
 * the myOPS CSV path this app already has creates cases from a paste, and
 * pasting the same export twice has no way to know it has seen those rows
 * before. With it, a connector asks "have I seen external id X" and updates
 * instead of duplicating.
 *
 * payload_hash lets a connector skip rows that have not changed, which is the
 * difference between a sync that costs one write and one that costs hundreds.
 */
create table if not exists integration_links (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references territories (id),
  integration_id uuid not null references integrations (id) on delete cascade,

  -- What the outside system calls it.
  external_kind text not null,
  external_id text not null,
  external_updated_at timestamptz,
  -- Hash of the last payload seen, so unchanged rows can be skipped.
  payload_hash text,

  -- What it is here. entity_type is intentionally free text rather than a
  -- foreign key: an integration may map to a row in any table, and a check
  -- constraint here would need editing every time the app grows a new one.
  entity_type text not null,
  entity_id uuid not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One external record maps to one local record per integration.
  unique (integration_id, external_kind, external_id)
);

create index if not exists integration_links_entity_idx
  on integration_links (entity_type, entity_id);

alter table integrations enable row level security;
alter table integration_runs enable row level security;
alter table integration_links enable row level security;

-- Integrations are territory-wide, not per-rep: a shipment feed is the
-- territory's, not one person's. Anyone in the territory may see and manage
-- them, matching how facilities and catalog items already behave.
drop policy if exists integrations_select on integrations;
create policy integrations_select on integrations for select
  using (territory_id = my_territory_id());

drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists integration_runs_select on integration_runs;
create policy integration_runs_select on integration_runs for select
  using (territory_id = my_territory_id());

drop policy if exists integration_runs_write on integration_runs;
create policy integration_runs_write on integration_runs for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

drop policy if exists integration_links_select on integration_links;
create policy integration_links_select on integration_links for select
  using (territory_id = my_territory_id());

drop policy if exists integration_links_write on integration_links;
create policy integration_links_write on integration_links for all
  using (territory_id = my_territory_id())
  with check (territory_id = my_territory_id());

grant select, insert, update, delete on integrations to authenticated;
grant select, insert, update, delete on integration_runs to authenticated;
grant select, insert, update, delete on integration_links to authenticated;
