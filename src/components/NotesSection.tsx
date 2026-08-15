import { useRef, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  createEntityNote,
  createTask,
  deleteEntityNote,
  listEntityNotes,
  listProfiles,
  setNotePinned,
  updateEntityNote,
  uploadPhoto,
} from "../lib/api";
import type { EntityNote, NoteEntityType, Profile } from "../lib/types";
import { formatRelativeDay, formatTimeOfDay, tomorrow } from "../utils/dates";
import { appendChecklistItem, toggleChecklistLine } from "../lib/wikilinks";
import ChecklistBody from "./ChecklistBody";

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
  const [dictating, setDictating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onPickPhoto(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  // Browser speech-to-text, where the platform offers it (iOS/Android/Chrome).
  // No API, no server — and the button simply doesn't render elsewhere.
  const SpeechRec =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;

  function startDictation() {
    if (!SpeechRec) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (SpeechRec as any)();
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setDictating(true);
    setAdding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => setDictating(false);
    rec.onerror = () => setDictating(false);
    try {
      rec.start();
    } catch {
      setDictating(false);
    }
  }

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
      const photoUrl = photoFile ? await uploadPhoto(photoFile, profile.territory_id) : null;
      await createEntityNote({
        entity_type: entityType,
        entity_id: entityId,
        body: draft.trim(),
        photo_url: photoUrl,
        territory_id: profile.territory_id,
        author_id: profile.id,
      });
      setDraft("");
      setAdding(false);
      onPickPhoto(null);
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

  /** Toggles a checkbox in a saved note directly — no need to open edit mode. */
  async function onToggleChecklist(note: EntityNote, lineIndex: number) {
    setBusy(true);
    try {
      await updateEntityNote(note.id, toggleChecklistLine(note.body, lineIndex));
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

  async function onTogglePin(note: EntityNote) {
    setBusy(true);
    try {
      await setNotePinned(note.id, !note.pinned);
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
        {!adding ? (
          <span className="flex items-center gap-1.5">
            {!!SpeechRec && (
              <button
                onClick={startDictation}
                className="min-h-0 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200"
                title="Dictate a note"
              >
                🎙️
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="min-h-0 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
            >
              + Add note
            </button>
          </span>
        ) : (
          !!SpeechRec && (
            <button
              onClick={startDictation}
              disabled={dictating}
              className={`min-h-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
                dictating ? "animate-pulse bg-red-700 text-white" : "bg-slate-700 text-slate-200"
              }`}
            >
              {dictating ? "● Listening…" : "🎙️ Dictate"}
            </button>
          )
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

          {photoPreview && (
            <div className="relative mt-1.5 inline-block">
              <img src={photoPreview} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <button
                onClick={() => {
                  onPickPhoto(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
              >
                ✕
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
          />

          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-0 rounded-lg bg-slate-700 px-2.5 py-2 text-xs font-medium text-slate-200"
              title="Attach a photo"
            >
              📷
            </button>
            <button
              onClick={() => setDraft((prev) => appendChecklistItem(prev))}
              className="min-h-0 rounded-lg bg-slate-700 px-2.5 py-2 text-xs font-medium text-slate-200"
              title="Add a checkbox"
            >
              + ☑
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setDraft("");
                onPickPhoto(null);
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
        {[...notes]
          .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))
          .map((n) =>
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
            <div
              key={n.id}
              className={`rounded-lg px-3 py-2 ${
                n.pinned ? "border border-amber-800/60 bg-amber-950/20" : "bg-slate-800/60"
              }`}
            >
              {n.pinned && (
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                  📌 Pinned
                </p>
              )}
              {n.photo_url && (
                <a href={n.photo_url} target="_blank" rel="noreferrer" className="mb-1.5 block">
                  <img src={n.photo_url} alt="" className="max-h-48 rounded-lg object-cover" />
                </a>
              )}
              <ChecklistBody
                body={n.body}
                onToggle={(lineIndex) => onToggleChecklist(n, lineIndex)}
                className="text-sm text-slate-200"
              />
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
                      onClick={() => onTogglePin(n)}
                      disabled={busy}
                      className="min-h-0 text-amber-400 underline"
                    >
                      {n.pinned ? "unpin" : "pin"}
                    </button>
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
