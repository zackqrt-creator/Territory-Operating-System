import { useEffect, useState } from "react";
import { Check, Link2, Lock, Sparkles, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
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
 * This used to open with a title field, a body field, an eight-way grid of
 * note kinds, a visibility row and a link picker -- five decisions standing
 * between a rep in a hallway and a thought they will have lost in ninety
 * seconds. Nobody wants to classify a note. They want to write it down.
 *
 * So the kind is gone from capture entirely. Everything lands as 'general',
 * which the Notes sidebar shows as Inbox, and filing it later is optional and
 * usually unnecessary. The title is the first line of what was typed, the way
 * Apple Notes and Obsidian both do it, because a separate title field is one
 * more thing to fill in and it is always a restatement of line one anyway.
 *
 * Visibility and entity links survive behind a disclosure. They are real
 * features -- a private note about a surgeon should stay private -- but they
 * are not on the path to saving.
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
  const [titleOverride, setTitleOverride] = useState("");
  const [visibility, setVisibility] = useState<TerritoryNoteVisibility>("private");
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [linkCaseId, setLinkCaseId] = useState("");
  const [linkFacilityId, setLinkFacilityId] = useState("");
  const [tags, setTags] = useState<TerritoryNoteTag[] | null>(null);
  const [tagId, setTagId] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);
  // Populated only after the note is safely written; the sheet then switches
  // from "write it down" to "is it about any of these?".
  const [savedId, setSaved] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedNoteLink[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  // Title/notebook/link fields are visible by default now — load their
  // options as soon as the sheet opens instead of waiting for a tap.
  useEffect(() => {
    listUpcomingCases().then(setCases).catch(() => setCases([]));
    listFacilities().then(setFacilities).catch(() => setFacilities([]));
    if (profile) listNoteTags(profile.territory_id).then(setTags).catch(() => setTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  function insertChecklistItem() {
    setText((prev) => appendChecklistItem(prev));
  }

  async function save() {
    const trimmed = text.trim();
    if (!profile || !trimmed) return;
    setSaving(true);
    try {
      // Title defaults to the first line (Apple Notes/Obsidian-style) unless
      // explicitly overridden. A single-line note gets an empty body rather
      // than a duplicate of its own title.
      const newline = trimmed.indexOf("\n");
      const autoTitle = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim().slice(0, 120);
      const title = titleOverride.trim() || autoTitle;
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
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-xs text-slate-500">First line becomes the title. File it later, or don't.</p>
          <button onClick={insertChecklistItem} className="shrink-0 text-xs font-medium text-sky-400">
            + ☑ Checkbox
          </button>
        </div>

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

        <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
            <label className="block text-xs text-slate-500">
              Title (optional — defaults to the first line)
              <input
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="Leave blank to use the first line"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </label>

            <div>
              <p className="pt-1 text-xs text-slate-500">Notebook</p>
              <select
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">Unfiled</option>
                {(tags ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New notebook name…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <button
                  onClick={onCreateTag}
                  disabled={!newTagName.trim()}
                  className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-sky-400 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            <button
              onClick={() => setVisibility(visibility === "private" ? "team" : "private")}
              className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5"
            >
              <span className="flex items-center gap-1.5 text-sm text-slate-300">
                {visibility === "private" ? (
                  <>
                    <Lock className="h-4 w-4" /> Private (only you)
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4" /> Team
                  </>
                )}
              </span>
              <span className="text-sm font-medium text-sky-400">
                {visibility === "private" ? "Share with team" : "Make private"}
              </span>
            </button>

            <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-500">
              <Link2 className="h-3.5 w-3.5" /> Link to a case or facility
            </p>
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
        </div>
        </>
        )}
      </div>
    </div>
  );
}
