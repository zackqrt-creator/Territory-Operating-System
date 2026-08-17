import { useState } from "react";
import { Download, Pencil, Trash2, X } from "lucide-react";
import type { TerritoryNoteFeedItem } from "../lib/types";
import { buildRows, viewKey, type NotesView, type Row } from "../lib/notesView";

/**
 * The note selector, shaped like OneNote's or Obsidian's rather than a row of
 * chips. Which buckets exist, and their counts, is decided by buildRows in
 * lib/notesView.ts -- this file only draws them.
 */
export default function NotesSidebar({
  notes,
  active,
  onSelect,
  onClose,
  onExport,
  exporting,
  onRenameNotebook,
  onDeleteNotebook,
}: {
  notes: TerritoryNoteFeedItem[];
  active: NotesView;
  onSelect: (v: NotesView) => void;
  /** Present on mobile, where the sidebar is a drawer; omitted on desktop. */
  onClose?: () => void;
  onExport: () => void;
  exporting: boolean;
  onRenameNotebook: (tagId: string, oldName: string, newName: string) => void | Promise<void>;
  onDeleteNotebook: (tagId: string, name: string) => void | Promise<void>;
}) {
  const { top, types, tags } = buildRows(notes);
  const activeKey = viewKey(active);
  const [managing, setManaging] = useState<Row | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  function openManage(row: Row) {
    setManaging(row);
    setRenameValue(row.label);
  }

  async function saveRename() {
    if (!managing?.tagId) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === managing.label) {
      setManaging(null);
      return;
    }
    setBusy(true);
    try {
      await onRenameNotebook(managing.tagId, managing.label, trimmed);
      setManaging(null);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!managing?.tagId) return;
    if (!confirm(`Delete the "${managing.label}" notebook? It will be removed from every note filed in it.`)) return;
    setBusy(true);
    try {
      await onDeleteNotebook(managing.tagId, managing.label);
      setManaging(null);
    } finally {
      setBusy(false);
    }
  }

  function Item({ row, manageable }: { row: Row; manageable?: boolean }) {
    const on = viewKey(row.view) === activeKey;
    const Icon = row.Icon;
    return (
      <div
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
          on ? "bg-sky-950/40 font-medium text-sky-300" : "text-slate-300"
        }`}
      >
        <button onClick={() => onSelect(row.view)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">{row.label}</span>
        </button>
        <span className="shrink-0 text-xs text-slate-500">{row.count}</span>
        {manageable && row.tagId && (
          <button
            onClick={() => openManage(row)}
            aria-label={`Manage ${row.label} notebook`}
            className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-800"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <nav className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2.5 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notebook</span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {top.map((r) => (
          <Item key={viewKey(r.view)} row={r} />
        ))}

        {types.length > 0 && (
          <>
            <p className="px-2.5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filed
            </p>
            {types.map((r) => (
              <Item key={viewKey(r.view)} row={r} />
            ))}
          </>
        )}

        {tags.length > 0 && (
          <>
            <p className="px-2.5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notebooks
            </p>
            {tags.map((r) => (
              <Item key={viewKey(r.view)} row={r} manageable />
            ))}
          </>
        )}
      </div>

      {managing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center"
          onClick={() => !busy && setManaging(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border border-slate-700/60 bg-slate-900 p-4 shadow-2xl md:rounded-2xl"
            style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-slate-100">Notebook</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveRename}
                disabled={busy || !renameValue.trim()}
                className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Rename
              </button>
              <button
                onClick={doDelete}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2.5 text-sm font-medium text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
            <button
              onClick={() => setManaging(null)}
              disabled={busy}
              className="mt-2 w-full text-center text-xs text-slate-500 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onExport}
        disabled={exporting}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-slate-700 px-2.5 py-2 text-left text-sm text-slate-300 disabled:opacity-50"
      >
        <Download className="h-4 w-4 shrink-0 opacity-70" />
        {exporting ? "Building…" : "Export as Markdown"}
      </button>
    </nav>
  );
}
