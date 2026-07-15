import { useEffect, useState } from "react";
import {
  createSurgeon,
  listSurgeonPreferences,
  listSurgeons,
  listToteTemplatesWithItems,
  updateSurgeonNotes,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { Surgeon, SurgeonPreference, ToteTemplateWithItems } from "../lib/types";

export default function Surgeons() {
  const { profile } = useAuth();
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [preferences, setPreferences] = useState<SurgeonPreference[]>([]);
  const [totes, setTotes] = useState<ToteTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  function refresh() {
    return Promise.all([listSurgeons(), listSurgeonPreferences(), listToteTemplatesWithItems()])
      .then(([s, p, t]) => {
        setSurgeons(s);
        setPreferences(p);
        setTotes(t);
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
      <h1 className="text-xl font-semibold text-white">Surgeons</h1>
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
  onSaved,
}: {
  surgeon: Surgeon;
  preferences: SurgeonPreference[];
  totes: ToteTemplateWithItems[];
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

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
      <h2 className="font-semibold text-white">{surgeon.name}</h2>

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
