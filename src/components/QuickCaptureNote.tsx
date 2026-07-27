import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createNote, linkNoteToEntity, listFacilities, listUpcomingCases } from "../lib/api";
import type { CaseRow, Facility, TerritoryNoteType, TerritoryNoteVisibility } from "../lib/types";
import { formatDateShort } from "../utils/dates";

const TYPE_OPTIONS: { value: TerritoryNoteType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "case", label: "Case" },
  { value: "hospital", label: "Hospital" },
  { value: "inventory", label: "Inventory" },
  { value: "replenishment", label: "Replenishment" },
  { value: "loaner", label: "Loaner" },
  { value: "surgeon", label: "Surgeon" },
  { value: "meeting", label: "Meeting" },
  { value: "idea", label: "Idea" },
];

/**
 * Mobile-first note capture: title + body + type, private by default. A rep
 * should be able to fire this off and be done in under 10 seconds — entity
 * linking is optional and collapsed so it never blocks the fast path.
 */
export default function QuickCaptureNote({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<TerritoryNoteType>("general");
  const [visibility, setVisibility] = useState<TerritoryNoteVisibility>("private");
  const [showLink, setShowLink] = useState(false);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [linkCaseId, setLinkCaseId] = useState("");
  const [linkFacilityId, setLinkFacilityId] = useState("");
  const [saving, setSaving] = useState(false);

  function openLinkPicker() {
    setShowLink(true);
    if (!cases) listUpcomingCases().then(setCases);
    if (!facilities) listFacilities().then(setFacilities);
  }

  async function save() {
    if (!profile || (!title.trim() && !body.trim())) return;
    setSaving(true);
    try {
      const note = await createNote({
        title: title.trim() || "Untitled note",
        body: body.trim(),
        note_type: noteType,
        visibility,
        source: "mobile",
        territory_id: profile.territory_id,
        owner_id: profile.id,
        created_by: profile.id,
      });
      if (linkCaseId) {
        await linkNoteToEntity({
          note_id: note.id,
          entity_type: "case",
          entity_id: linkCaseId,
          territory_id: profile.territory_id,
          created_by: profile.id,
        });
      }
      if (linkFacilityId) {
        await linkNoteToEntity({
          note_id: note.id,
          entity_type: "facility",
          entity_id: linkFacilityId,
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
        <h2 className="text-lg font-semibold text-white">New note</h2>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's going on..."
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500"
        />

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => setNoteType(t.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                noteType === t.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5">
          <span className="text-sm text-slate-300">
            {visibility === "private" ? "🔒 Private (only you)" : "👥 Team"}
          </span>
          <button
            onClick={() => setVisibility(visibility === "private" ? "team" : "private")}
            className="text-sm font-medium text-sky-400"
          >
            {visibility === "private" ? "Make team-visible" : "Make private"}
          </button>
        </div>

        {!showLink ? (
          <button onClick={openLinkPicker} className="mt-3 text-sm font-medium text-sky-400">
            + Link to a case or facility
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <select
              value={linkCaseId}
              onChange={(e) => setLinkCaseId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 py-2.5 text-center text-sm font-medium text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || (!title.trim() && !body.trim())}
            className="flex-1 rounded-lg bg-sky-600 py-2.5 text-center text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
