# Integrations

Plumbing for connecting Territory OS to outside systems. **No connector exists
yet.** This describes the shape one plugs into.

## The rule that decides the architecture

Territory OS is a client-side PWA. Every `VITE_` variable is compiled into the
bundle, and any row the app can read is a row a browser can read. So:

- **A credential never lives in the app, and never in the `integrations` table.**
- `integrations.config` holds non-secret settings — an account id, a folder
  name, a base URL, a toggle.
- `integrations.credential_ref` holds the **name** of a Supabase secret, e.g.
  `MYOPS_API_TOKEN`. Never the value.
- The connector runs in the `integration-run` edge function, which reads that
  named secret from its own environment. The browser can ask it to run and can
  read what happened. It cannot read the key.

This is the same bargain `link-note` already makes with `ANTHROPIC_API_KEY`, and
it exists because the previous prototype hardcoded credentials in a public repo.
AGENTS.md records that as one of the reasons that repo is dead.

## The honesty rule

The Integrations screen must never report a connection it has not made. A
provider with no connector shows as **Not built yet** with its actions disabled;
it does not offer a Test Connection that appears to succeed. A failed attempt is
recorded as a failed run.

This is not fussiness. The first time a fabricated status matters is the morning
someone trusts it about tomorrow's cases.

## The three tables

| Table | What it is for |
|---|---|
| `integrations` | One row per configured provider: enabled, status, non-secret config, credential name, last success, consecutive failures, sync cursor. |
| `integration_runs` | Every attempt, test or sync. Opened *before* the work starts, so a crash leaves a visible `running` row rather than silence. This is where "last successful sync" and "errors requiring attention" come from. |
| `integration_links` | Maps an outside system's record id to a row here. This is what makes a re-sync update instead of duplicate. |

`integration_links` is the one that is easy to skip and expensive to add later.
The existing myOPS CSV import has no such map, which is why pasting the same
export twice has no way to know it has seen those rows before.

## Writing a connector

1. **Implement the `Connector` interface** in
   `supabase/functions/integration-run/index.ts`:

   ```ts
   interface Connector {
     test(ctx: ConnectorContext): Promise<ConnectorResult>;
     sync(ctx: ConnectorContext): Promise<ConnectorResult>;
   }
   ```

   `ctx.credential` is the resolved secret. `ctx.db` is a Supabase client
   authenticated **as the calling user**, so RLS still applies to everything the
   connector writes — a connector is a dispatcher, not a privilege escalation.

2. **Register it** in the `CONNECTORS` map, keyed by provider name.

3. **Flip the provider to `available`** in `src/lib/integrations/registry.ts`.
   Until you do, the UI keeps its actions disabled.

4. **Set the secret**:

   ```bash
   supabase secrets set MYOPS_API_TOKEN=...
   supabase functions deploy integration-run
   ```

### Making a sync idempotent

Before creating anything, ask whether this external record is already known:

```ts
const existing = await findIntegrationLink({
  integrationId, externalKind: "case", externalId: row.id,
});
```

If it exists, update `existing.entity_id`. If not, create the local row and then
call `upsertIntegrationLink`. Store a `payload_hash` so unchanged records can be
skipped — that is the difference between a sync costing one write and hundreds.

### Incremental sync

Return a `cursor` from `sync()` and it is stored on `integrations.sync_cursor`.
Its shape is the connector's business: a timestamp, a page token, a delta link.

## What is deliberately not built

- **No scheduler.** Runs are manual. `integration_runs.trigger` already allows
  `scheduled` and `webhook` so a pg_cron job or webhook endpoint can be added
  without a migration.
- **No OAuth flow.** Providers needing one will need a callback endpoint; the
  `credential_ref` indirection is what makes storing the resulting token safe.
- **No retry or backoff.** `consecutive_failures` is tracked so a future
  scheduler has something to back off on.
- **No connectors.** On purpose. This phase is the foundation only.

## Current provider status

| Provider | Status | Notes |
|---|---|---|
| myOPS | Manual import | The CSV and paste importers are real and used daily. No API connector. |
| Calendar | Not built | |
| Shipment tracking | Not built | |
| Evernote | Not built | |
| Litmos | Not built | |
| Document sources | Not built | |
