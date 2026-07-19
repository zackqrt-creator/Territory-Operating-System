import { useEffect, useState } from "react";
import {
  createSurgeon,
  listSurgeonPreferences,
  listSurgeons,
  listToteTemplatesWithItems,
  listUpcomingCases,
  updateSurgeonNotes,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { CaseRow, Surgeon, SurgeonPreference, ToteTemplateWithItems } from "../lib/types";
import { formatDateShort } from "../utils/dates";

export default function Surgeons() {
  const { profile } = useAuth();
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [preferences, setPreferences] = useState<SurgeonPreference[]>([]);
  const [totes, setTotes] = useState<ToteTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [allCases, setAllCases] = useState<CaseRow[]>([]);

  function refresh() {
    return Promise.all([
      listSurgeons(),
      listSurgeonPreferences(),
      listToteTemplatesWithItems(),
      listUpcomingCases(),
    ]).then(([s, p, t, c]) => {
      setSurgeons(s);
      setPreferences(p);
      setTotes(t);
      setAllCases(c);
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function onAddSurgeon() {
    if (!newName.trim() || !profile) return;
    setAdding(true);
    try {
      await createSurgeon(newName.trim(), profile.territory_id);
      setNewName("");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Surgeons</h1>
      <p className="mt-1 text-sm text-slate-400">
        Preferences drive the pack list. Notes are just for the team — what they like, what to
        expect, anything worth knowing before a case.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a surgeon..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <button
          onClick={onAddSurgeon}
          disabled={adding || !newName.trim()}
          className="rounded-lg bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-5 space-y-3">
          {surgeons.map((s) => (
            <SurgeonCard
              key={s.id}
              surgeon={s}
              preferences={preferences.filter((p) => p.surgeon_id === s.id)}
              totes={totes}
              cases={allCases.filter((c) => c.surgeon_id === s.id)}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SurgeonCard({
  surgeon,
  preferences,
  totes,
  cases,
  onSaved,
}: {
  surgeon: Surgeon;
  preferences: SurgeonPreference[];
  totes: ToteTemplateWithItems[];
  cases: CaseRow[];
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(surgeon.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = notes !== (surgeon.notes ?? "");

  async function onSave() {
    setSaving(true);
    try {
      await updateSurgeonNotes(surgeon.id, notes);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  // Profile stats derived entirely from existing case records — no new entry.
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const q0 = new Date(now.getTime() - 90 * 86400_000);
  const q1 = new Date(now.getTime() - 180 * 86400_000);
  const done = cases.filter((c) => c.status !== "cancelled");
  const thisQ = done.filter((c) => c.surgery_date >= iso(q0) && c.surgery_date <= iso(now)).length;
  const prevQ = done.filter((c) => c.surgery_date >= iso(q1) && c.surgery_date < iso(q0)).length;
  const knees = done.filter((c) => c.surgery_type === "KNEE").length;
  const hips = done.filter((c) => c.surgery_type === "HIP").length;
  const recentNotes = done
    .filter((c) => c.notes)
    .sort((a, b) => b.surgery_date.localeCompare(a.surgery_date))
    .slice(0, 2);
  const trend = prevQ === 0 ? null : thisQ - prevQ;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
      <h2 className="font-semibold text-white">{surgeon.name}</h2>

      {done.length > 0 && (
        <div className="mt-2 rounded-lg bg-slate-800/50 p-2.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>
              <span className="font-semibold text-white">{done.length}</span> cases on record
            </span>
            <span>
              Last 90d: <span className="font-semibold text-white">{thisQ}</span>
              {trend !== null && (
                <span className={trend >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {" "}
                  ({trend >= 0 ? "+" : ""}
                  {trend} vs prior)
                </span>
              )}
            </span>
            {(knees > 0 || hips > 0) && (
              <span>
                Mix: {knees} knee / {hips} hip
              </span>
            )}
          </div>
          {recentNotes.map((c) => (
            <p key={c.id} className="mt-1 truncate text-xs text-slate-500">
              {formatDateShort(c.surgery_date)}: {c.notes}
            </p>
          ))}
        </div>
      )}

      {preferences.length > 0 && (
        <div className="mt-2 space-y-1">
          {preferences.map((p) => {
            const instrumentTote = totes.find((t) => t.id === p.instrument_tote_id);
            const implantTote = totes.find((t) => t.id === p.implant_tote_id);
            return (
              <p key={p.id} className="text-xs text-slate-500">
                {p.surgery_type === "KNEE" ? "Knee" : "Hip"} ({p.variant}){p.alignment_technique ? ` · ${p.alignment_technique}` : ""}
                {p.cement_type && p.cement_type !== "NA" ? ` · ${p.cement_type}` : ""}
                {instrumentTote ? ` · ${instrumentTote.name}` : ""}
                {implantTote ? ` + ${implantTote.name}` : ""}
              </p>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-xs text-slate-400">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What they like most, what to expect, anything worth knowing..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        {dirty && (
          <button
            onClick={onSave}
            disabled={saving}
            className="mt-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save notes"}
          </button>
        )}
        {!dirty && saved && <p className="mt-2 text-sm text-emerald-400">Saved ✓</p>}
      </div>
    </div>
  );
}
