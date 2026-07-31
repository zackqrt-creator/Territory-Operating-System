import { useState } from "react";

/**
 * Inline rename: click the pencil, edit in place, save. Same shape for
 * every renameable record (surgeon, facility, set, catalog item) so users
 * don't have to hunt for a different edit flow per entity type.
 */
export default function RenameField({
  value,
  onSave,
  textClassName = "text-lg font-semibold text-slate-100",
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  textClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-sky-600 bg-slate-800 px-2 py-1 text-slate-100"
        />
        <button
          onClick={onSubmit}
          disabled={saving}
          className="min-h-0 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="min-h-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group flex items-center gap-1.5 text-left"
    >
      <span className={textClassName}>{value}</span>
      <span className="text-xs text-slate-600 group-active:text-sky-400">✎</span>
    </button>
  );
}
