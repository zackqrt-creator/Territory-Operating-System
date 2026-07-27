import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listNoteFeed, listSecondBrainQueue } from "../lib/api";
import type { TerritoryNoteFeedItem, TerritoryNoteType } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";
import QuickCaptureNote from "../components/QuickCaptureNote";

type FilterKey = "all" | TerritoryNoteType | "private";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "case", label: "Case" },
  { key: "inventory", label: "Inventory" },
  { key: "replenishment", label: "Replenishment" },
  { key: "loaner", label: "Loaner" },
  { key: "hospital", label: "Hospital" },
  { key: "task", label: "Tasks" },
  { key: "private", label: "Private" },
];

const TYPE_ICON: Record<TerritoryNoteType, string> = {
  general: "🗒️",
  case: "📅",
  hospital: "🏥",
  inventory: "📦",
  replenishment: "🔁",
  loaner: "🔄",
  consignment: "📋",
  surgeon: "🩺",
  task: "☑️",
  meeting: "🧑‍🤝‍🧑",
  idea: "💡",
  ai_summary: "🧠",
};

/**
 * The field-rep second brain's front door: pinned notes float to the top,
 * everything else sorts newest-updated. Filters are one tap, search is
 * instant (client-side over title/body/ai_summary — feed sizes here are
 * small enough that a server round trip isn't worth it).
 */
export default function Notes() {
  const [notes, setNotes] = useState<TerritoryNoteFeedItem[]>([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showCapture, setShowCapture] = useState(false);

  function refresh() {
    return Promise.all([listNoteFeed(), listSecondBrainQueue()]).then(([n, q]) => {
      setNotes(n);
      setPendingReview(q.length);
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (filter === "private" && n.visibility !== "private") return false;
      if (filter !== "all" && filter !== "private" && n.note_type !== filter) return false;
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle) ||
        (n.ai_summary ?? "").toLowerCase().includes(needle)
      );
    });
  }, [notes, filter, q]);

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notes</h1>
          <p className="mt-1 text-sm text-slate-400">Your second brain — search, link, review.</p>
        </div>
        <Link
          to="/notes/second-brain"
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-center text-xs font-medium text-slate-300"
        >
          🧠 Review
          {pendingReview > 0 && (
            <span className="ml-1 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingReview}
            </span>
          )}
        </Link>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search notes…"
        className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.key ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-400">
          {notes.length === 0 ? "No notes yet — tap + to write your first one." : "No notes match."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((n) => (
            <Link
              key={n.id}
              to={`/notes/${n.id}`}
              className="block rounded-xl border border-slate-700 bg-slate-900/40 p-3 active:bg-slate-900"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                {n.pinned && <span title="Pinned">📌</span>}
                <span>{TYPE_ICON[n.note_type]}</span>
                <span className="truncate">{n.title}</span>
                {n.visibility === "private" && <span className="text-slate-500">🔒</span>}
              </div>
              {n.body && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-300">{n.body}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatRelativeDay(n.updated_at)}</span>
                {n.links.length > 0 && <span>· {n.links.length} linked</span>}
                {n.tags.map((t) => (
                  <span key={t.id} className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                    {t.name}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowCapture(true)}
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-2xl text-white shadow-lg active:bg-sky-700"
        style={{ marginBottom: "var(--safe-bottom)" }}
      >
        +
      </button>

      {showCapture && (
        <QuickCaptureNote
          onClose={() => setShowCapture(false)}
          onCreated={() => {
            setShowCapture(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
