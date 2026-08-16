import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Pin, Lock, Link2, BrainCircuit, PanelLeft } from "lucide-react";
import { deleteNoteTag, listNoteFeed, listPages, listSecondBrainQueue, renameNoteTag } from "../lib/api";
import type { TerritoryNoteFeedItem } from "../lib/types";
import { noteKindIcon } from "../lib/noteKinds";
import { buildVaultFiles, buildZip } from "../lib/markdownExport";
import { formatRelativeDay } from "../utils/dates";
import QuickCaptureNote from "../components/QuickCaptureNote";
import NotesSidebar from "../components/NotesSidebar";
import { matchesView, viewLabel, type NotesView } from "../lib/notesView";

/**
 * Territory OS Notes — the capture layer of the team-memory system.
 *
 * Navigation is a sidebar rather than a chip row: a persistent column on a
 * wide screen, a drawer on a phone, listing only the buckets that hold
 * something. Notes land in Inbox and are filed later if ever.
 */
export default function Notes() {
  const [notes, setNotes] = useState<TerritoryNoteFeedItem[]>([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<NotesView>({ kind: "all" });
  const [showCapture, setShowCapture] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  function refresh() {
    return Promise.all([listNoteFeed(), listSecondBrainQueue()]).then(([n, queue]) => {
      setNotes(n);
      setPendingReview(queue.length);
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (!matchesView(n, view)) return false;
      if (!needle) return true;
      return (
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.name.toLowerCase().includes(needle))
      );
    });
  }, [notes, view, q]);

  /**
   * Knowledge pages are fetched here rather than on mount: the export is the
   * only thing that needs them, and most visits never press it.
   */
  async function exportVault() {
    setExporting(true);
    try {
      const pages = await listPages().catch(() => []);
      const zip = buildZip(buildVaultFiles(notes, pages));
      const url = URL.createObjectURL(
        new Blob([zip as unknown as BlobPart], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `territory-os-notes-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setDrawerOpen(false);
    } finally {
      setExporting(false);
    }
  }

  function select(v: NotesView) {
    setView(v);
    setDrawerOpen(false);
  }

  async function renameNotebook(tagId: string, oldName: string, newName: string) {
    await renameNoteTag(tagId, newName);
    await refresh();
    setView((v) => (v.kind === "tag" && v.value === oldName ? { kind: "tag", value: newName } : v));
  }

  async function deleteNotebook(tagId: string, name: string) {
    await deleteNoteTag(tagId);
    await refresh();
    setView((v) => (v.kind === "tag" && v.value === name ? { kind: "all" } : v));
  }

  const sidebar = (onClose?: () => void) => (
    <NotesSidebar
      notes={notes}
      active={view}
      onSelect={select}
      onClose={onClose}
      onExport={exportVault}
      exporting={exporting}
      onRenameNotebook={renameNotebook}
      onDeleteNotebook={deleteNotebook}
    />
  );

  return (
    <div className="min-h-screen pb-28 pt-6">
      <div className="mx-auto flex max-w-5xl gap-6 px-4">
        {/* Persistent on a wide screen; the drawer below covers phones. */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20 max-h-[calc(100vh-7rem)]">{sidebar()}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Browse notebook"
                className="mt-0.5 shrink-0 rounded-lg border border-slate-700 p-2 text-slate-300 md:hidden"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-slate-100">{viewLabel(view)}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  {filtered.length} note{filtered.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <Link
              to="/notes/review"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300"
            >
              <BrainCircuit className="h-4 w-4" />
              Review
              {pendingReview > 0 && (
                <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingReview}
                </span>
              )}
            </Link>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 pl-9 pr-4 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          {loading ? (
            <p className="mt-8 text-slate-400">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-slate-400">
              {notes.length === 0
                ? "No notes yet — tap + to capture your first one."
                : "No notes match."}
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {filtered.map((n) => {
                const Icon = noteKindIcon(n.note_type);
                return (
                  <Link
                    key={n.id}
                    to={`/notes/${n.id}`}
                    className="block rounded-xl border border-slate-700 bg-slate-900/40 p-3 active:bg-slate-900"
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                      {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                      <Icon className="h-4 w-4 shrink-0 text-sky-300" />
                      <span className="truncate">{n.title}</span>
                      {n.visibility === "private" && (
                        <Lock className="h-3 w-3 shrink-0 text-slate-500" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-300">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{formatRelativeDay(n.updated_at)}</span>
                      {n.links.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> {n.links.length}
                        </span>
                      )}
                      {n.tags.map((t) => (
                        <span
                          key={t.id}
                          className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex bg-black/60 md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full w-64 max-w-[80vw] overflow-hidden border-r border-slate-700/60 bg-slate-900 p-3 pt-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar(() => setDrawerOpen(false))}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowCapture(true)}
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg active:bg-sky-700"
        style={{ marginBottom: "var(--safe-bottom)" }}
        aria-label="New note"
      >
        <Plus className="h-6 w-6" />
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
