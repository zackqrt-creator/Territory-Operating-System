import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSecondBrainQueue, setSecondBrainStatus } from "../lib/api";
import type { SecondBrainStatus, TerritoryNote } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";

const STATUS_META: Record<SecondBrainStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-slate-400" },
  needs_review: { label: "Needs review", color: "text-amber-400" },
  ready: { label: "Ready", color: "text-sky-400" },
  synced: { label: "Synced", color: "text-emerald-400" },
  ignored: { label: "Ignored", color: "text-slate-600" },
};

/**
 * Review queue before a note becomes durable knowledge (future AI/Obsidian
 * sync). The pipeline itself isn't built yet — this just makes the status
 * visible and lets a rep triage it by hand in the meantime.
 */
export default function SecondBrainQueue() {
  const [notes, setNotes] = useState<TerritoryNote[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    return listSecondBrainQueue().then(setNotes);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function setStatus(id: string, status: SecondBrainStatus) {
    await setSecondBrainStatus(id, status);
    refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Second brain queue</h1>
      <p className="mt-1 text-sm text-slate-400">
        Notes waiting to become durable knowledge — review before they sync.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="mt-8 text-slate-400">Nothing to review — the queue is empty.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between">
                <Link to={`/notes/${n.id}`} className="truncate text-sm font-medium text-sky-300">
                  {n.title}
                </Link>
                <span className={`shrink-0 text-xs font-medium ${STATUS_META[n.second_brain_status].color}`}>
                  {STATUS_META[n.second_brain_status].label}
                </span>
              </div>
              {n.body && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{n.body}</p>}

              {n.ai_summary && (
                <div className="mt-2 rounded-lg border border-sky-800/60 bg-sky-950/20 p-2">
                  <p className="text-xs font-medium text-sky-300">AI summary</p>
                  <p className="mt-0.5 text-sm text-sky-100">{n.ai_summary}</p>
                </div>
              )}
              {Array.isArray(n.ai_action_items) && n.ai_action_items.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-sm text-slate-300">
                  {n.ai_action_items.map((item, i) => (
                    <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}

              <p className="mt-1.5 text-xs text-slate-500">Updated {formatRelativeDay(n.updated_at)}</p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["ready", "synced", "ignored", "needs_review"] as SecondBrainStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(n.id, s)}
                    disabled={n.second_brain_status === s}
                    className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 disabled:opacity-40"
                  >
                    Mark {STATUS_META[s].label.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
