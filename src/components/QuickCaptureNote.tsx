import { useRef, useState } from "react";
import { Camera, Check, CheckSquare, Link2, Lock, NotebookPen, Sparkles, Users, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  addNotePhoto,
  assignNoteTag,
  createNote,
  createNoteTag,
  linkNoteToEntity,
  listFacilities,
  listNoteTags,
  listUpcomingCases,
  suggestNoteLinks,
  type SuggestedNoteLink,
} from "../lib/api";
import type { CaseRow, Facility, TerritoryNoteTag, TerritoryNoteVisibility } from "../lib/types";
import { formatDateShort } from "../utils/dates";
import { appendChecklistItem } from "../lib/wikilinks";

/**
 * One box. Type, save, done.
 *
 * The title field, notebook picker, and link picker used to sit permanently
 * on screen, which just traded "hidden behind a tap" for "empty and staring
 * at you" — worse, since now three unused controls compete with the one
 * thing that matters (the text box) for attention every single time.
 *
 * So: one row of icon buttons below the textarea. Tapping one reveals
 * exactly that thing — a photo picker, a notebook chip, a case/facility
 * link — and nothing else changes. Nothing is ever visible unless it's
 * either in use or being decided right now. The title is still just the
 * first line of what was typed; there's no separate field for it, but it's
 * always editable afterward from the note's own page.
 */
export default function QuickCaptureNote({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<TerritoryNoteVisibility>("private");
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [linkCaseId, setLinkCaseId] = useState("");
  const [linkFacilityId, setLinkFacilityId] = useState("");
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [tags, setTags] = useState<TerritoryNoteTag[] | null>(null);
  const [tagId, setTagId] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [showNotebookPicker, setShowNotebookPicker] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  // Populated only after the note is safely written; the sheet then switches
  // from "write it down" to "is it about any of these?".
  const [savedId, setSaved] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedNoteLink[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  function openLinkPicker() {
    setShowLinkPicker(true);
    if (!cases) listUpcomingCases().then(setCases).catch(() => setCases([]));
    if (!facilities) listFacilities().then(setFacilities).catch(() => setFacilities([]));
  }

  function openNotebookPicker() {
    setShowNotebookPicker(true);
    if (!tags && profile) listNoteTags(profile.territory_id).then(setTags).catch(() => setTags([]));
  }

  async function onCreateTag() {
    if (!profile || !newTagName.trim()) return;
    const created = await createNoteTag({
      name: newTagName.trim(),
      territory_id: profile.territory_id,
      created_by: profile.id,
    });
    setTags((prev) => [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName("");
    setTagId(created.id);
    setShowNotebookPicker(false);
  }

  function insertChecklistItem() {
    setText((prev) => appendChecklistItem(prev));
  }

  function onPickPhotos(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  const linkedCaseLabel = cases?.find((c) => c.id === linkCaseId);
  const linkedFacilityName = facilities?.find((f) => f.id === linkFacilityId)?.name;
  const notebookName = tags?.find((t) => t.id === tagId)?.name;

  async function save() {
    const trimmed = text.trim();
    if (!profile || !trimmed) return;
    setSaving(true);
    try {
      // Title is just the first line (Apple Notes/Obsidian-style) — renameable
      // later from the note's own page, no separate field needed here.
      const newline = trimmed.indexOf("\n");
      const title = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim().slice(0, 120);
      const body = newline === -1 ? "" : trimmed.slice(newline + 1).trim();

      const note = await createNote({
        title,
        body,
        note_type: "general",
        visibility,
        source: "mobile",
        territory_id: profile.territory_id,
        owner_id: profile.id,
        created_by: profile.id,
      });
      for (const [entity_type, entity_id] of [
        ["case", linkCaseId],
        ["facility", linkFacilityId],
      ] as const) {
        if (!entity_id) continue;
        await linkNoteToEntity({
          note_id: note.id,
          entity_type,
          entity_id,
          territory_id: profile.territory_id,
          created_by: profile.id,
        });
      }
      if (tagId) await assignNoteTag(note.id, tagId);
      for (const p of photos) {
        await addNotePhoto({ file: p.file, territory_id: profile.territory_id, note_id: note.id, uploaded_by: profile.id });
      }

      // The note is saved and safe from here on. Suggestions are a bonus
      // offered afterwards, never something the rep waits on -- the whole
      // point of this screen is that capture is instant.
      setSaved(note.id);
      setLinking(true);
      suggestNoteLinks(trimmed)
        .then((s) => setSuggestions(s.filter((l) => l.entity_id !== linkCaseId)))
        .catch(() => setSuggestions([]))
        .finally(() => setLinking(false));
    } finally {
      setSaving(false);
    }
  }

  async function accept(link: SuggestedNoteLink) {
    if (!profile || !savedId) return;
    setBusyId(link.entity_id);
    try {
      await linkNoteToEntity({
        note_id: savedId,
        entity_type: link.entity_type,
        entity_id: link.entity_id,
        relationship: link.relationship,
        territory_id: profile.territory_id,
        created_by: profile.id,
      });
      setAccepted((prev) => new Set(prev).add(link.entity_id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        {savedId ? (
          /* Saved. Everything below is optional and the rep can walk away. */
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
              <Check className="h-4 w-4" /> Saved
            </p>

            {linking ? (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                <Sparkles className="h-3.5 w-3.5" /> Looking for what this is about…
              </p>
            ) : suggestions.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                Nothing obvious to link it to — it's in your Inbox.
              </p>
            ) : (
              <>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" /> Is this about any of these?
                </p>
                <div className="mt-2 space-y-2">
                  {suggestions.map((s) => {
                    const done = accepted.has(s.entity_id);
                    return (
                      <button
                        key={`${s.entity_type}:${s.entity_id}`}
                        onClick={() => accept(s)}
                        disabled={done || busyId === s.entity_id}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left disabled:opacity-100 ${
                          done
                            ? "border-emerald-800 bg-emerald-950/25"
                            : "border-slate-700 bg-slate-800/50"
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">
                          {done ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Link2 className="h-4 w-4 text-sky-400" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-100">{s.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {s.entity_type}
                            {s.confidence !== "high" && ` · ${s.confidence} confidence`}
                          </span>
                          {/* The quote is the point: a link you can't check is
                              a link you shouldn't trust. */}
                          <span className="mt-1 block text-xs italic text-slate-400">
                            “{s.evidence}”
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <button
              onClick={onCreated}
              className="mt-4 w-full rounded-lg bg-sky-600 py-3 text-center text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's going on…"
              rows={7}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-base text-slate-100 placeholder:text-slate-500"
            />
            <p className="mt-1.5 text-xs text-slate-500">First line becomes the title. File it later, or don't.</p>

            {/* Photo thumbnails — only present once something's attached. */}
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-0 items-center justify-center rounded-full bg-slate-900 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Notebook chip — only present once one's picked. */}
            {tagId && notebookName && (
              <button
                onClick={() => setTagId("")}
                className="mt-2 flex items-center gap-1.5 rounded-full bg-sky-950/50 px-3 py-1 text-xs text-sky-300"
              >
                <NotebookPen className="h-3 w-3" /> {notebookName} <X className="h-3 w-3" />
              </button>
            )}

            {/* Link chips — only present once something's linked. */}
            {(linkedCaseLabel || linkedFacilityName) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {linkedCaseLabel && (
                  <button
                    onClick={() => setLinkCaseId("")}
                    className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300"
                  >
                    <Link2 className="h-3 w-3" /> {formatDateShort(linkedCaseLabel.surgery_date)} · {linkedCaseLabel.surgery_type}
                    <X className="h-3 w-3" />
                  </button>
                )}
                {linkedFacilityName && (
                  <button
                    onClick={() => setLinkFacilityId("")}
                    className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300"
                  >
                    <Link2 className="h-3 w-3" /> {linkedFacilityName} <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* The one row that's always there — everything else is a tap away. */}
            <div className="mt-3 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => onPickPhotos(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Add a photo"
                className="rounded-lg p-2 text-slate-400 active:bg-slate-800"
              >
                <Camera className="h-5 w-5" />
              </button>
              <button onClick={insertChecklistItem} title="Add a checkbox" className="rounded-lg p-2 text-slate-400 active:bg-slate-800">
                <CheckSquare className="h-5 w-5" />
              </button>
              <button onClick={openNotebookPicker} title="File in a notebook" className="rounded-lg p-2 text-slate-400 active:bg-slate-800">
                <NotebookPen className="h-5 w-5" />
              </button>
              <button onClick={openLinkPicker} title="Link to a case or facility" className="rounded-lg p-2 text-slate-400 active:bg-slate-800">
                <Link2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setVisibility(visibility === "private" ? "team" : "private")}
                title={visibility === "private" ? "Private — tap to share with team" : "Team-visible — tap to make private"}
                className="rounded-lg p-2 text-slate-400 active:bg-slate-800"
              >
                {visibility === "private" ? <Lock className="h-5 w-5" /> : <Users className="h-5 w-5 text-sky-400" />}
              </button>
            </div>

            {showNotebookPicker && (
              <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                {(tags ?? []).length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {(tags ?? []).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTagId(t.id);
                          setShowNotebookPicker(false);
                        }}
                        className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New notebook name…"
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    onClick={onCreateTag}
                    disabled={!newTagName.trim()}
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
                <button onClick={() => setShowNotebookPicker(false)} className="mt-2 text-xs text-slate-500 underline">
                  Close
                </button>
              </div>
            )}

            {showLinkPicker && (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                <select
                  value={linkCaseId}
                  onChange={(e) => setLinkCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">No case</option>
                  {(cases ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDateShort(c.surgery_date)} · {c.surgery_type}
                      {c.side ? ` ${c.side === "LEFT" ? "L" : "R"}` : ""}
                      {c.surgeon ? ` · ${c.surgeon}` : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={linkFacilityId}
                  onChange={(e) => setLinkFacilityId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">No facility</option>
                  {(facilities ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => setShowLinkPicker(false)} className="text-xs text-slate-500 underline">
                  Close
                </button>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !text.trim()}
                className="flex-1 rounded-lg bg-sky-600 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
