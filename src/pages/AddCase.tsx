import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { bulkCreateCases, createCase, listFacilities, updateLastFacility } from "../lib/api";
import type { CaseVariant, Facility, Side, SurgeryType } from "../lib/types";
import { nextWednesday } from "../utils/dates";
import { dedupeByCaseId, parsePasteText, type ParsedCase } from "../utils/parsePaste";

export default function AddCase() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"quick" | "paste">("quick");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    listFacilities().then(setFacilities);
  }, []);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-xl font-semibold text-white">Add case</h1>

      <div className="mt-4 flex rounded-lg border border-slate-700 bg-slate-800/50 p-1">
        <button
          onClick={() => setMode("quick")}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            mode === "quick" ? "bg-sky-600 text-white" : "text-slate-400"
          }`}
        >
          Quick add
        </button>
        <button
          onClick={() => setMode("paste")}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            mode === "paste" ? "bg-sky-600 text-white" : "text-slate-400"
          }`}
        >
          Paste import
        </button>
      </div>

      {mode === "quick" ? (
        <QuickAddForm
          facilities={facilities}
          territoryId={profile?.territory_id ?? ""}
          profileId={profile?.id ?? ""}
          lastFacilityId={profile?.last_facility_id ?? null}
          onDone={() => navigate("/cases")}
        />
      ) : (
        <PasteImport
          facilities={facilities}
          territoryId={profile?.territory_id ?? ""}
          profileId={profile?.id ?? ""}
          lastFacilityId={profile?.last_facility_id ?? null}
          onDone={() => navigate("/cases")}
        />
      )}
    </div>
  );
}

function QuickAddForm({
  facilities,
  territoryId,
  profileId,
  lastFacilityId,
  onDone,
}: {
  facilities: Facility[];
  territoryId: string;
  profileId: string;
  lastFacilityId: string | null;
  onDone: () => void;
}) {
  const [date, setDate] = useState(nextWednesday());
  const [type, setType] = useState<SurgeryType>("KNEE");
  const [variant, setVariant] = useState<CaseVariant>("total");
  const [side, setSide] = useState<Side | null>("LEFT");
  const [facilityId, setFacilityId] = useState(lastFacilityId ?? "");
  const [surgeon, setSurgeon] = useState("");
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!facilityId && facilities.length > 0) {
      setFacilityId(lastFacilityId ?? facilities[0].id);
    }
  }, [facilities, lastFacilityId, facilityId]);

  async function onSubmit() {
    if (!facilityId || !territoryId || !profileId) return;
    setSaving(true);
    try {
      await createCase({
        surgery_type: type,
        side,
        variant: type === "INSTRUMENT" ? null : variant,
        surgery_date: date,
        facility_id: facilityId,
        surgeon: surgeon.trim() || null,
        territory_id: territoryId,
        created_by: profileId,
      });
      await updateLastFacility(profileId, facilityId);
      setJustAdded(true);
      setSurgeon("");
      setTimeout(() => setJustAdded(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div>
        <label className="mb-1 block text-sm text-slate-400">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(["KNEE", "HIP", "INSTRUMENT"] as SurgeryType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg py-3 font-medium ${
                type === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t === "KNEE" ? "Knee" : t === "HIP" ? "Hip" : "Instrument"}
            </button>
          ))}
        </div>
      </div>

      {type !== "INSTRUMENT" && (
        <div>
          <label className="mb-1 block text-sm text-slate-400">Total or partial</label>
          <div className="flex gap-2">
            {(["total", "partial"] as CaseVariant[]).map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={`flex-1 rounded-lg py-3 font-medium capitalize ${
                  variant === v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-400">Side</label>
        <div className="flex gap-2">
          {(["LEFT", "RIGHT"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`flex-1 rounded-lg py-3 font-medium ${
                side === s ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {s === "LEFT" ? "Left" : "Right"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Facility</label>
        <select
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Surgeon (optional)</label>
        <input
          type="text"
          value={surgeon}
          onChange={(e) => setSurgeon(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={saving || !facilityId}
        className="w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white active:bg-sky-700 disabled:opacity-50"
      >
        {justAdded ? "Added ✓" : saving ? "Saving..." : "Add case"}
      </button>
      <button onClick={onDone} className="w-full text-sm text-slate-500 underline">
        Done adding cases
      </button>
    </div>
  );
}

function PasteImport({
  facilities,
  territoryId,
  profileId,
  lastFacilityId,
  onDone,
}: {
  facilities: Facility[];
  territoryId: string;
  profileId: string;
  lastFacilityId: string | null;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedCase[]>([]);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [facilityId, setFacilityId] = useState(lastFacilityId ?? "");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!facilityId && facilities.length > 0) {
      setFacilityId(lastFacilityId ?? facilities[0].id);
    }
  }, [facilities, lastFacilityId, facilityId]);

  function onParse() {
    const all = parsePasteText(text);
    const { rows, duplicates } = dedupeByCaseId(all);
    setParsed(rows);
    setIncluded(rows.map(() => true));
    setDuplicates(duplicates);
    setResult(null);
  }

  async function onImport() {
    if (!facilityId || !territoryId || !profileId) return;
    const rows = parsed.filter((_, i) => included[i]);
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkCreateCases(
        rows.map((r) => ({
          case_id: r.case_id,
          surgery_type: r.surgery_type,
          side: r.side,
          surgery_date: r.surgery_date,
          surgery_time: r.surgery_time,
          facility_id: facilityId,
          territory_id: territoryId,
          created_by: profileId,
        })),
      );
      await updateLastFacility(profileId, facilityId);
      setResult(res);
      setParsed([]);
      setText("");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-slate-400">
        Select case rows in myOPS, copy, and paste them below. We'll pull out the date, type, and
        side automatically — review before importing.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste myOPS rows here..."
        rows={6}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
      />

      <button
        onClick={onParse}
        disabled={!text.trim()}
        className="w-full rounded-lg bg-slate-700 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        Parse
      </button>

      {result && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-emerald-300">
          Imported {result.inserted} case{result.inserted === 1 ? "" : "s"}
          {result.skipped > 0 ? ` (${result.skipped} already existed)` : ""}.
        </div>
      )}

      {parsed.length > 0 && (
        <>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Facility for these cases</label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-400">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Side</th>
                  <th className="p-2">Case #</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={included[i]}
                        onChange={(e) =>
                          setIncluded((prev) => {
                            const next = [...prev];
                            next[i] = e.target.checked;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-2 text-slate-300">{row.surgery_date}</td>
                    <td className="p-2 text-slate-300">{row.surgery_type}</td>
                    <td className="p-2 text-slate-300">{row.side ?? "—"}</td>
                    <td className="p-2 text-slate-500">{row.case_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            {parsed.length} row{parsed.length === 1 ? "" : "s"} parsed
            {duplicates > 0 ? `, ${duplicates} duplicate row(s) already dropped` : ""}. Existing
            case IDs will be skipped automatically on import too.
          </p>

          <button
            onClick={onImport}
            disabled={importing || included.every((v) => !v)}
            className="w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white active:bg-sky-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : `Import ${included.filter(Boolean).length} case(s)`}
          </button>
        </>
      )}

      <button onClick={onDone} className="w-full text-sm text-slate-500 underline">
        Done
      </button>
    </div>
  );
}
