import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plug,
  Play,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  createIntegration,
  finishIntegrationRun,
  invokeIntegrationRun,
  listIntegrationRuns,
  listIntegrations,
  startIntegrationRun,
  updateIntegration,
} from "../lib/api";
import { PROVIDERS, canRun } from "../lib/integrations/registry";
import type { ProviderDefinition } from "../lib/integrations/registry";
import type { IntegrationRun, IntegrationRunKind, IntegrationWithRun } from "../lib/types";

/**
 * What Territory OS is connected to, and what it is not.
 *
 * The honesty rule governs this whole screen. A provider with no connector
 * shows as "Not built yet" with its actions disabled -- it never offers a Test
 * Connection that appears to succeed, and nothing here invents a sync result.
 * The first time a fabricated status matters is the morning someone trusts it
 * about tomorrow's cases, so the screen would rather say nothing than guess.
 *
 * Every Test and Sync opens a run row before the work starts and closes it
 * after, which is where "last successful sync" and "errors requiring
 * attention" come from. A failure is recorded as a failure.
 */

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function StatusChip({
  integration,
  def,
}: {
  integration: IntegrationWithRun | null;
  def: ProviderDefinition;
}) {
  if (def.availability === "planned") {
    return (
      <span className="shrink-0 rounded-full bg-slate-500/20 px-2.5 py-1 text-xs font-semibold text-slate-400">
        Not built yet
      </span>
    );
  }
  if (def.availability === "manual") {
    return (
      <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
        Manual import
      </span>
    );
  }
  if (!integration) {
    return (
      <span className="shrink-0 rounded-full bg-slate-500/20 px-2.5 py-1 text-xs font-semibold text-slate-400">
        Not set up
      </span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "Connected", cls: "bg-emerald-500/15 text-emerald-300" },
    error: { label: "Needs attention", cls: "bg-red-500/15 text-red-300" },
    disabled: { label: "Off", cls: "bg-slate-500/20 text-slate-400" },
    not_configured: { label: "Not configured", cls: "bg-slate-500/20 text-slate-400" },
  };
  const meta = map[integration.enabled ? integration.status : "disabled"] ?? map.not_configured;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export default function Integrations() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<IntegrationWithRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, IntegrationRun[]>>({});

  const reload = useCallback(async () => {
    const list = await listIntegrations();
    setRows(list);
  }, []);

  useEffect(() => {
    listIntegrations()
      .then(setRows)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Couldn't load integrations."),
      )
      .finally(() => setLoading(false));
  }, []);

  const byProvider = useMemo(() => {
    const map = new Map<string, IntegrationWithRun>();
    for (const r of rows) map.set(r.provider, r);
    return map;
  }, [rows]);

  const attention = rows.filter((r) => r.enabled && r.status === "error");

  /** Creates the row on first use, so the list is not pre-seeded with fiction. */
  async function ensureRow(def: ProviderDefinition): Promise<IntegrationWithRun | null> {
    if (!profile) return null;
    const existing = byProvider.get(def.provider);
    if (existing) return existing;
    const created = await createIntegration({
      territoryId: profile.territory_id,
      provider: def.provider,
      displayName: def.displayName,
      credentialRef: def.credentialRef,
    });
    await reload();
    return { ...created, latest_run: null };
  }

  async function run(def: ProviderDefinition, kind: IntegrationRunKind) {
    if (!profile || busy) return;
    setBusy(def.provider);
    setError(null);
    try {
      const integration = await ensureRow(def);
      if (!integration) return;

      const started = await startIntegrationRun({
        territoryId: profile.territory_id,
        integrationId: integration.id,
        kind,
        createdBy: profile.id,
      });

      // The server does the work; the browser holds no credential and cannot.
      const result = await invokeIntegrationRun({ integrationId: integration.id, kind });

      await finishIntegrationRun({
        runId: started.id,
        integrationId: integration.id,
        status: result.ok ? "success" : "error",
        errorMessage: result.ok ? null : result.message,
        errorDetail: result.detail ?? null,
        summary: result.ok ? { message: result.message } : null,
      });

      if (!result.ok) setError(result.message);
      await reload();
      if (expanded === integration.id) await loadRuns(integration.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't run.");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(def: ProviderDefinition) {
    if (!profile) return;
    const integration = await ensureRow(def);
    if (!integration) return;
    await updateIntegration(integration.id, {
      enabled: !integration.enabled,
      status: !integration.enabled ? integration.status : "disabled",
    });
    await reload();
  }

  async function loadRuns(integrationId: string) {
    const list = await listIntegrationRuns(integrationId);
    setRuns((prev) => ({ ...prev, [integrationId]: list }));
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Integrations</h1>
      <p className="mt-1 text-sm text-slate-400">
        What Territory OS talks to. Nothing here reports a connection it hasn't actually made.
      </p>

      {error && (
        <p role="alert" className="mt-4 border-l border-red-400 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {attention.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-800 bg-red-950 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-red-300">
            {attention.length === 1
              ? `${attention[0].display_name} needs attention.`
              : `${attention.length} integrations need attention.`}
          </p>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400" aria-live="polite">
          Loading…
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {PROVIDERS.map((def) => {
            const integration = byProvider.get(def.provider) ?? null;
            const Icon = def.icon;
            const runnable = canRun(def);
            const isBusy = busy === def.provider;
            const open = integration && expanded === integration.id;

            return (
              <li
                key={def.provider}
                className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400">
                      <Icon size={16} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">{def.displayName}</p>
                      <p className="mt-0.5 text-sm leading-snug text-slate-400">
                        {def.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Brings: {def.brings.join(" · ")}</p>
                    </div>
                  </div>
                  <StatusChip integration={integration} def={def} />
                </div>

                {integration && runnable && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock size={12} aria-hidden />
                    Last successful sync: {relativeTime(integration.last_success_at)}
                    {integration.consecutive_failures > 0 &&
                      ` · ${integration.consecutive_failures} failed ${
                        integration.consecutive_failures === 1 ? "attempt" : "attempts"
                      } since`}
                  </p>
                )}

                {integration?.last_error && (
                  <p className="mt-2 border-l border-red-400 bg-red-950 px-3 py-2 text-xs leading-snug text-red-300">
                    {integration.last_error}
                  </p>
                )}

                {def.availability === "manual" && def.manualRoute && (
                  <p className="mt-2 text-xs leading-snug text-slate-500">
                    No live connection yet — this data arrives when you import an export by hand.
                  </p>
                )}

                {def.availability === "planned" && (
                  <p className="mt-2 text-xs leading-snug text-slate-500">
                    The framework is ready for this. The connector is not written, so it cannot be
                    tested or synced.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => run(def, "test")}
                    disabled={!runnable || isBusy}
                    className="flex min-h-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 font-medium text-slate-300 disabled:opacity-40"
                  >
                    {isBusy ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Play size={14} aria-hidden />
                    )}
                    <span className="text-sm">Test connection</span>
                  </button>

                  <button
                    onClick={() => run(def, "sync")}
                    disabled={!runnable || isBusy || !integration?.enabled}
                    className="flex min-h-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 font-medium text-slate-300 disabled:opacity-40"
                  >
                    <RefreshCw size={14} aria-hidden />
                    <span className="text-sm">Sync now</span>
                  </button>

                  <button
                    onClick={() => toggle(def)}
                    disabled={def.availability === "planned"}
                    className="flex min-h-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 font-medium text-slate-300 disabled:opacity-40"
                  >
                    <span className="text-sm">{integration?.enabled ? "Disable" : "Enable"}</span>
                  </button>

                  {integration && (
                    <button
                      onClick={async () => {
                        const next = open ? null : integration.id;
                        setExpanded(next);
                        if (next) await loadRuns(integration.id);
                      }}
                      className="min-h-0 px-1 py-2 text-sm text-sky-400"
                    >
                      {open ? "Hide history" : "History"}
                    </button>
                  )}
                </div>

                {open && (
                  <div className="mt-3 border-t border-slate-700 pt-3">
                    {(runs[integration.id] ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No runs recorded.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {(runs[integration.id] ?? []).map((r) => (
                          <li key={r.id} className="flex items-start gap-2 text-xs">
                            {r.status === "success" ? (
                              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
                            ) : r.status === "running" ? (
                              <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-slate-400" aria-hidden />
                            ) : (
                              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
                            )}
                            <span className="min-w-0 text-slate-400">
                              <span className="text-slate-300">{r.kind}</span> ·{" "}
                              {relativeTime(r.started_at)}
                              {r.status === "success" &&
                                r.items_seen > 0 &&
                                ` · ${r.items_seen} seen, ${r.items_created} new, ${r.items_updated} updated`}
                              {r.error_message && (
                                <span className="block text-red-300">{r.error_message}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <Plug size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
        <p className="text-xs leading-relaxed text-slate-500">
          Credentials never live in this app. A connector runs on the server and reads its key from
          Supabase's secret store; Territory OS only stores the name of that key. See
          docs/integrations.md to add one.
        </p>
      </div>
    </div>
  );
}

