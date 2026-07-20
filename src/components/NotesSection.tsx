import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  createEntityNote,
  createTask,
  deleteEntityNote,
  listEntityNotes,
  listProfiles,
  updateEntityNote,
} from "../lib/api";
import type { EntityNote, NoteEntityType, Profile } from "../lib/types";
import { formatRelativeDay, formatTimeOfDay, tomorrow } from "../utils/dates";

/**
 * Universal note thread — drop onto any record (case, item, tote, surgeon).
 * Timestamped, authored, team-visible; authors can edit or delete their own
 * notes any time. This is the "add a note to anything" layer of the CRM.
 */
export default function NotesSection({
  entityType,
  entityId,
  title = "Notes",
  placeholder = "Write a note…",
}: {
  entityType: NoteEntityType;
  entityId: string;
  title?: string;
  placeholder?: string;
}) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState(tomorrow());
  const [followUpDone, setFollowUpDone] = useState<Set<string>>(new Set());

  function refresh() {
    return listEntityNotes(entityType, entityId).then(setNotes);
  }
  useEffect(() => {
    refresh().catch(() => {});
    listProfiles().then(setProfiles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const nameOf = (id: string | null) =>
    id === profile?.id ? "You" : (profiles.find((p) => p.id === id)?.display_name ?? "Someone");

  async function onAdd() {
    if (!draft.trim() || !profile) return;
    setBusy(true);
    try {
      await createEntityNote({
        entity_type: entityType,
        entity_id: entityId,
        body: draft.trim(),
        territory_id: profile.territory_id,
        author_id: profile.id,
      });
      setDraft("");
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(id: string) {
    if (!editDraft.trim()) return;
    setBusy(true);
    try {
      await updateEntityNote(id, editDraft.trim());
      setEditingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await deleteEntityNote(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onCreateFollowUp(note: EntityNote) {
    if (!profile) return;
    setBusy(true);
    try {
      const snippet = note.body.length > 60 ? `${note.body.slice(0, 60)}…` : note.body;
      await createTask({
        title: `Follow up: ${snippet}`,
        notes: note.body,
        due_date: followUpDate || null,
        source_note_id: note.id,
        territory_id: profile.territory_id,
        owner_id: profile.id,
      });
      setFollowUpId(null);
      setFollowUpDate(tomorrow());
      setFollowUpDone((prev) => new Set(prev).add(note.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {title}{notes.length > 0 ? ` (${notes.length})` : ""}
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="min-h-0 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
          >
            + Add note
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="min-h-0 flex-1 rounded-lg bg-slate-800 py-2 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={onAdd}
              disabled={busy || !draft.trim()}
              className="min-h-0 flex-1 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <p className="mt-1.5 text-xs text-slate-600">No notes yet.</p>
      )}

      <div className="mt-2 space-y-2">
        {notes.map((n) =>
          editingId === n.id ? (
            <div key={n.id}>
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="min-h-0 flex-1 rounded-lg bg-slate-800 py-2 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onSaveEdit(n.id)}
                  disabled={busy}
                  className="min-h-0 flex-1 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div key={n.id} className="rounded-lg bg-slate-800/60 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  {nameOf(n.author_id)} · {formatRelativeDay(n.created_at)}{" "}
                  {formatTimeOfDay(n.created_at)}
                  {n.updated_at ? " · edited" : ""}
                </span>
                {followUpDone.has(n.id) ? (
                  <span className="text-emerald-400">✓ task created</span>
                ) : followUpId === n.id ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="min-h-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white"
                    />
                    <button
                      onClick={() => onCreateFollowUp(n)}
                      disabled={busy}
                      className="min-h-0 rounded bg-sky-600 px-2 py-0.5 font-medium text-white disabled:opacity-50"
                    >
                      Create task
                    </button>
                    <button onClick={() => setFollowUpId(null)} className="min-h-0 text-slate-500 underline">
                      cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setFollowUpId(n.id)}
                    className="min-h-0 text-sky-400 underline"
                  >
                    ⏰ follow up
                  </button>
                )}
                {n.author_id === profile?.id && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(n.id);
                        setEditDraft(n.body);
                      }}
                      className="min-h-0 text-sky-400 underline"
                    >
                      edit
                    </button>
                    <button onClick={() => onDelete(n.id)} disabled={busy} className="min-h-0 text-slate-600">
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
