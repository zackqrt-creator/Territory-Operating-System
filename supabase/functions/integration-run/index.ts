/**
 * Runs an integration connector.
 *
 * WHY THIS IS A SERVER FUNCTION
 *
 * Same reason as link-note, and it is the whole architecture of the framework.
 * Territory OS is a client-side PWA: every VITE_ variable is baked into the
 * bundle, and any row the app can read a browser can read. So a connector's
 * credential can never live in the app or in the `integrations` table. It lives
 * in Supabase's secret store; `integrations.credential_ref` holds only the NAME
 * of that secret; and this function -- which the browser can invoke but not
 * read -- is the only place the two ever meet.
 *
 * WHAT IT DOES NOT DO
 *
 * There are no connectors yet. This dispatcher deliberately returns a plain,
 * honest failure for every provider rather than a plausible success. An
 * integration screen that reports a connection it has not made is worse than
 * one that reports nothing, because the first time anyone finds out is the
 * morning they trusted it about tomorrow's cases. So: no fabricated results, no
 * "connected" without a round trip, and the failed attempt is still recorded as
 * a real run so the history stays truthful.
 *
 * TO ADD A CONNECTOR
 *
 * Write a handler with the `Connector` shape below, add it to CONNECTORS, flip
 * the provider to `available` in src/lib/integrations/registry.ts, and set its
 * secret with `supabase secrets set MYOPS_API_TOKEN=...`. The run lifecycle,
 * status roll-up, error reporting and external-id mapping are already handled.
 * See docs/integrations.md.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface IntegrationRow {
  id: string;
  territory_id: string;
  provider: string;
  display_name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credential_ref: string | null;
  sync_cursor: Record<string, unknown> | null;
}

export interface ConnectorContext {
  integration: IntegrationRow;
  /** The value of the named secret, resolved here so a connector never names it. */
  credential: string | null;
  /** Authenticated as the caller, so RLS still applies to anything written. */
  db: ReturnType<typeof createClient>;
}

export interface ConnectorResult {
  ok: boolean;
  message: string;
  counts?: {
    items_seen?: number;
    items_created?: number;
    items_updated?: number;
    items_skipped?: number;
  };
  summary?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  /** Where to resume next time, for incremental sync. */
  cursor?: Record<string, unknown>;
}

export interface Connector {
  /** Cheap round trip that proves the credential and endpoint work. */
  test(ctx: ConnectorContext): Promise<ConnectorResult>;
  /** The actual import. */
  sync(ctx: ConnectorContext): Promise<ConnectorResult>;
}

/**
 * Empty on purpose. Every provider in the registry is declared but unbuilt, so
 * every call below falls through to the honest error at the bottom.
 */
const CONNECTORS: Record<string, Connector> = {};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "POST only." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, message: "Not signed in." }, 401);

  let body: { integration_id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Expected a JSON body." }, 400);
  }

  const integrationId = body.integration_id;
  const kind = body.kind === "sync" || body.kind === "backfill" ? body.kind : "test";
  if (!integrationId) return json({ ok: false, message: "integration_id is required." }, 400);

  // The caller's own JWT, so every read and write stays inside their territory's
  // RLS. This function is a dispatcher, not a privilege escalation.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: integration, error: loadErr } = await db
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (loadErr) return json({ ok: false, message: loadErr.message }, 500);
  if (!integration) return json({ ok: false, message: "That integration does not exist." }, 404);

  const row = integration as IntegrationRow;

  if (!row.enabled && kind !== "test") {
    return json({ ok: false, message: `${row.display_name} is switched off.` }, 400);
  }

  const connector = CONNECTORS[row.provider];
  if (!connector) {
    // The honest path, and currently the only one. Reported as a failure so the
    // run history records what really happened.
    return json(
      {
        ok: false,
        message: `No connector is built for ${row.display_name} yet. The framework is in place; the connector is not.`,
        detail: { provider: row.provider, reason: "connector_not_registered" },
      },
      501,
    );
  }

  // Resolved here, never sent to the client and never passed back in a response.
  const credential = row.credential_ref ? (Deno.env.get(row.credential_ref) ?? null) : null;
  if (row.credential_ref && !credential) {
    return json(
      {
        ok: false,
        message: `${row.display_name} needs the secret ${row.credential_ref}, which is not set on this project.`,
        detail: { reason: "missing_secret", credential_ref: row.credential_ref },
      },
      400,
    );
  }

  try {
    const ctx: ConnectorContext = { integration: row, credential, db };
    const result = kind === "test" ? await connector.test(ctx) : await connector.sync(ctx);
    return json(result, result.ok ? 200 : 502);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, message, detail: { reason: "connector_threw" } }, 502);
  }
});
