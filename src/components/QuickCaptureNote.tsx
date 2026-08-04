import { useState } from "react";
import { ChevronDown, Link2, Lock, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { createNote, linkNoteToEntity, listFacilities, listUpcomingCases } from "../lib/api";
import type { CaseRow, Facility, TerritoryNoteVisibility } from "../lib/types";
import { formatDateShort } from "../utils/dates";

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
  const [visibility, setVisibility] = useState<TerritoryNoteVisibility>("private");
  const [showMore, setShowMore] = useState(false);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [linkCaseId, setLinkCaseId] = useState("");
  const [linkFacilityId, setLinkFacilityId] = useState("");
  const [saving, setSaving] = useState(false);

  function openMore() {
    setShowMore(true);
    if (!cases) listUpcomingCases().then(setCases).catch(() => setCases([]));
    if (!facilities) listFacilities().then(setFacilities).catch(() => setFacilities([]));
  }

  async function save() {
    const trimmed = text.trim();
    if (!profile || !trimmed) return;
    setSaving(true);
    try {
      // First line is the title, the rest is the body. A single-line note gets
      // an empty body rather than a duplicate of its own title.
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
      onCreated();
    } finally {
      setSaving(false);
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

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's going on…"
          rows={7}
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-base text-slate-100 placeholder:text-slate-500"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          First line becomes the title. File it later, or don't.
        </p>

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

        {!showMore ? (
          <button
            onClick={openMore}
            className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-medium text-slate-500"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {visibility === "private" ? "Private" : "Team-visible"} · add a link
          </button>
        ) : (
          <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
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
        )}
      </div>
    </div>
  );
}
