import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrainCircuit, ArrowUpRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { listSecondBrainQueue, promoteNoteToPage, setSecondBrainStatus } from "../lib/api";
import type { SecondBrainStatus, TerritoryNote } from "../lib/types";
import { noteKindIcon, noteKindLabel } from "../lib/noteKinds";
import { formatRelativeDay } from "../utils/dates";

const STATUS_META: Record<SecondBrainStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-slate-400" },
  needs_review: { label: "Needs review", color: "text-amber-400" },
  ready: { label: "Ready", color: "text-sky-400" },
  synced: { label: "Synced", color: "text-emerald-400" },
  ignored: { label: "Ignored", color: "text-slate-600" },
};

/**
 * The team-memory review queue: raw capture notes waiting to be triaged and
 * promoted into durable knowledge pages. A rep summarizes/tags/links a note,
 * then "Promote to page" turns it into a permanent playbook entry others can
 * search. Obsidian sync (if ever wired) rides on top of these same pages.
 */
export default function SecondBrainQueue() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<TerritoryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

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

  async function promote(note: TerritoryNote) {
    if (!profile || promoting) return;
    setPromoting(note.id);
    try {
      const page = await promoteNoteToPage(note, profile.id);
      navigate(`/pages/${page.id}`);
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-6 w-6 text-sky-400" />
        <h1 className="text-2xl font-bold text-slate-100">Review queue</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Triage raw notes, then promote the keepers into durable knowledge pages the whole team can
        search.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="mt-8 text-slate-400">Nothing to review — the queue is empty.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {notes.map((n) => {
            const Icon = noteKindIcon(n.note_type);
            return (
              <div key={n.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/notes/${n.id}`} className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-sky-300">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{n.title}</span>
                  </Link>
                  <span className={`shrink-0 text-xs font-medium ${STATUS_META[n.second_brain_status].color}`}>
                    {STATUS_META[n.second_brain_status].label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{noteKindLabel(n.note_type)}</p>
                {n.body && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{n.body}</p>}

                <p className="mt-1.5 text-xs text-slate-500">Updated {formatRelativeDay(n.updated_at)}</p>

                <button
                  onClick={() => promote(n)}
                  disabled={promoting === n.id}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  {promoting === n.id ? "Promoting…" : "Promote to knowledge page"}
                </button>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["ready", "ignored", "needs_review"] as SecondBrainStatus[]).map((s) => (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
