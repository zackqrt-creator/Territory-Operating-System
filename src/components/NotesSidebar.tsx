import { Download, X } from "lucide-react";
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
}: {
  notes: TerritoryNoteFeedItem[];
  active: NotesView;
  onSelect: (v: NotesView) => void;
  /** Present on mobile, where the sidebar is a drawer; omitted on desktop. */
  onClose?: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { top, types, tags } = buildRows(notes);
  const activeKey = viewKey(active);

  function Item({ row }: { row: Row }) {
    const on = viewKey(row.view) === activeKey;
    const Icon = row.Icon;
    return (
      <button
        onClick={() => onSelect(row.view)}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
          on ? "bg-sky-950/40 font-medium text-sky-300" : "text-slate-300 active:bg-slate-800/60"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
        <span className="truncate">{row.label}</span>
        <span className="ml-auto shrink-0 text-xs text-slate-500">{row.count}</span>
      </button>
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
              Tags
            </p>
            {tags.map((r) => (
              <Item key={viewKey(r.view)} row={r} />
            ))}
          </>
        )}
      </div>

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
