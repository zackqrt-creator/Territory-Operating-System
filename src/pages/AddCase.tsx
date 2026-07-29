import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  bulkCreateCases,
  createCase,
  createCaseItemPlans,
  createSurgeon,
  listFacilities,
  listInventory,
  listRecentMovements,
  listProfiles,
  listSurgeons,
  listTimeOff,
  listUpcomingCases,
  updateLastFacility,
} from "../lib/api";
import type {
  CaseRow,
  CaseVariant,
  Facility,
  InventoryItem,
  Movement,
  Profile,
  Side,
  Surgeon,
  SurgeryType,
  TimeOff,
} from "../lib/types";
import { buildPreferenceCard, type SuggestedItem, type SuggestionMode } from "../lib/crm";
import { dayLoadWarnings } from "../lib/runsheet";
import { formatDateShort, formatTime, nextWednesday } from "../utils/dates";
import { dedupeByCaseId, parsePasteText } from "../utils/parsePaste";
import { dedupeMyopsRows, parseMyopsCsv } from "../utils/parseMyopsCsv";

export default function AddCase() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"quick" | "paste">("quick");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);

  useEffect(() => {
    listFacilities().then(setFacilities);
    listSurgeons().then(setSurgeons);
  }, []);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Add case</h1>

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
          CSV / paste import
        </button>
      </div>

      {mode === "quick" ? (
        <QuickAddForm
          facilities={facilities}
          surgeons={surgeons}
          onSurgeonCreated={(s) => setSurgeons((prev) => [...prev, s])}
          territoryId={profile?.territory_id ?? ""}
          profileId={profile?.id ?? ""}
          lastFacilityId={profile?.last_facility_id ?? null}
          onDone={(flash) => navigate("/", { state: { flash } })}
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
  surgeons,
  onSurgeonCreated,
  territoryId,
  profileId,
  lastFacilityId,
  onDone,
}: {
  facilities: Facility[];
  surgeons: Surgeon[];
  onSurgeonCreated: (s: Surgeon) => void;
  territoryId: string;
  profileId: string;
  lastFacilityId: string | null;
  onDone: (flash: string) => void;
}) {
  const [params] = useSearchParams();
  // The calendar day sheet hands off ?date=&time= when you tap an empty slot,
  // so scheduling from the calendar lands here already filled in.
  const initialDate = params.get("date") || nextWednesday();
  const initialTime = params.get("time") || "";
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  // A required field should not shout at you before you have had a chance to
  // fill it in. Only complain once it has been touched or submit was tried.
  const [timeTouched, setTimeTouched] = useState(false);
  const [type, setType] = useState<SurgeryType>("KNEE");
  const [variant, setVariant] = useState<CaseVariant>("total");
  const [side, setSide] = useState<Side | null>("LEFT");
  const [facilityId, setFacilityId] = useState(lastFacilityId ?? "");
  const [surgeon, setSurgeon] = useState("");
  const [saving, setSaving] = useState(false);

  // Preference card: history for auto-suggesting this surgeon's usual items.
  const [history, setHistory] = useState<{
    cases: CaseRow[];
    movements: Movement[];
    inventory: InventoryItem[];
  } | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<Profile[]>([]);
  const [mode, setMode] = useState<SuggestionMode>("frequent");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [manualItems, setManualItems] = useState<SuggestedItem[]>([]);
  const [manualName, setManualName] = useState("");

  useEffect(() => {
    Promise.all([listUpcomingCases(), listRecentMovements(500), listInventory()])
      .then(([c, m, i]) => setHistory({ cases: c, movements: m, inventory: i }))
      .catch(() => {});
    listTimeOff().then(setTimeOff).catch(() => {});
    listProfiles().then(setTeamProfiles).catch(() => {});
  }, []);

  const matchedSurgeon = surgeons.find(
    (s) => s.name.toLowerCase() === surgeon.trim().toLowerCase(),
  );
  const suggestions: SuggestedItem[] =
    history && matchedSurgeon && type !== "INSTRUMENT"
      ? buildPreferenceCard(
          matchedSurgeon.id,
          type,
          variant,
          history.cases,
          history.movements,
          history.inventory,
          mode,
        )
      : [];

  const surgicalFacilities = facilities.filter((f) => f.type === "hospital" || f.type === "surgery_center");

  useEffect(() => {
    if (!facilityId && surgicalFacilities.length > 0) {
      const last = surgicalFacilities.find((f) => f.id === lastFacilityId);
      setFacilityId(last?.id ?? surgicalFacilities[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, lastFacilityId, facilityId]);

  // Conflict preview: what does this day look like once the new case is on it?
  const sameDayCases = (history?.cases ?? []).filter(
    (c) => c.surgery_date === date && c.status === "scheduled",
  );
  const prospective = {
    id: "draft",
    surgery_date: date,
    surgery_time: time || null,
    time_tba: !time,
    facility_id: facilityId || null,
  } as CaseRow;
  const loadWarnings =
    sameDayCases.length > 0
      ? dayLoadWarnings([...sameDayCases, prospective], facilities).filter(
          // The draft always counts as TBA — don't nag about its own missing time.
          (w) => !w.includes("TBA"),
        )
      : [];
  const facName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";
  const outThatDay = timeOff.filter((t) => t.start_date <= date && t.end_date >= date);

  /** Resolves the typed surgeon name to an existing profile (case-insensitive),
   * creating a new one if it doesn't match — so pack-list preferences can
   * find this case later without you having to pick from a separate list. */
  async function resolveSurgeon(): Promise<{ name: string | null; id: string | null }> {
    const name = surgeon.trim();
    if (!name) return { name: null, id: null };
    const existing = surgeons.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) return { name: existing.name, id: existing.id };
    const created = await createSurgeon(name, territoryId);
    onSurgeonCreated(created);
    return { name: created.name, id: created.id };
  }

  async function onSubmit() {
    if (!time) {
      // The button is disabled without a time, but guard anyway and make the
      // reason visible rather than having the tap do nothing.
      setTimeTouched(true);
      return;
    }
    if (!facilityId || !territoryId || !profileId) return;
    setSaving(true);
    try {
      const resolved = await resolveSurgeon();
      const created = await createCase({
        surgery_type: type,
        side,
        variant: type === "INSTRUMENT" ? null : variant,
        surgery_date: date,
        surgery_time: time,
        time_tba: false,
        facility_id: facilityId,
        surgeon: resolved.name,
        surgeon_id: resolved.id,
        territory_id: territoryId,
        created_by: profileId,
      });
      const acceptedSuggestions = suggestions.filter(
        (s) => enabled[`${s.category}|${s.name}`] ?? true,
      );
      const planRows = [
        ...acceptedSuggestions.map((s) => ({ ...s, source: "suggested" as const })),
        ...manualItems.map((s) => ({ ...s, source: "manual" as const })),
      ];
      if (planRows.length > 0) {
        await createCaseItemPlans(
          planRows.map((s) => ({
            territory_id: territoryId,
            case_id: created.id,
            name: s.name,
            category: s.category,
            quantity: s.quantity,
            source: s.source,
          })),
        );
        setManualItems([]);
      }
      await updateLastFacility(profileId, facilityId);
      // Leave the page on success. A form that silently clears itself looks
      // identical to a form that failed -- going home with a confirmation is
      // the only unambiguous signal that the case actually saved.
      const label = [
        type === "KNEE" ? "Knee" : type === "HIP" ? "Hip" : "Instrument",
        side ? (side === "LEFT" ? "Left" : "Right") : null,
      ]
        .filter(Boolean)
        .join(" ");
      onDone(
        `${label} case saved — ${formatDateShort(date)} at ${formatTime(time)}, ${facName(facilityId)}`,
      );
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
        <label className="mb-1 block text-sm text-slate-400">
          Start time <span className="text-red-400">*</span>
        </label>
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            setTimeTouched(true);
          }}
          onBlur={() => setTimeTouched(true)}
          className={`w-full rounded-lg border bg-slate-800 px-4 py-3 text-white ${
            !time && timeTouched ? "border-red-800" : "border-slate-700"
          }`}
        />
        {/* Typing into a native time input is fiddly on a phone and clears
            itself while half-entered. Common start times are one tap. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["07:00", "07:30", "08:00", "09:00", "10:00", "11:00", "13:00"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTime(t);
                setTimeTouched(true);
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                time === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {formatTime(t)}
            </button>
          ))}
        </div>
        {!time && timeTouched && (
          <p className="mt-1 text-xs text-red-400">
            A case without a time can't be sequenced or staged. Pick one above.
          </p>
        )}
      </div>

      {outThatDay.length > 0 && (
        <div className="rounded-xl border border-violet-800/60 bg-violet-950/25 p-3">
          {outThatDay.map((t) => (
            <p key={t.id} className="text-sm font-medium text-violet-300">
              🏖️ {teamProfiles.find((p) => p.id === t.rep_id)?.display_name ?? "A teammate"} is out
              this day{t.reason ? ` (${t.reason})` : ""} — plan coverage.
            </p>
          ))}
        </div>
      )}

      {sameDayCases.length > 0 && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/25 p-3">
          <p className="text-sm font-medium text-amber-200">
            Already on this day ({sameDayCases.length}):
          </p>
          <div className="mt-1 space-y-0.5">
            {sameDayCases.slice(0, 4).map((c) => (
              <p key={c.id} className="text-sm text-amber-100/80">
                {c.time_tba || !c.surgery_time ? "TBA" : formatTime(c.surgery_time)} ·{" "}
                {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instr"}
                {c.side ? ` ${c.side === "LEFT" ? "L" : "R"}` : ""} · {facName(c.facility_id)}
              </p>
            ))}
          </div>
          {loadWarnings.map((w) => (
            <p key={w} className="mt-1 text-sm font-medium text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-400">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["KNEE", "HIP"] as SurgeryType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg py-3 font-medium ${
                type === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t === "KNEE" ? "Knee" : "Hip"}
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
          {/* Only real surgical sites — a case can't happen at storage, corporate, or a rep's vehicle. */}
          {surgicalFacilities.map((f) => (
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
          list="surgeon-options"
          value={surgeon}
          onChange={(e) => setSurgeon(e.target.value)}
          placeholder="Start typing a name..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <datalist id="surgeon-options">
          {surgeons.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <p className="mt-1 text-xs text-slate-500">
          Matching an existing surgeon lets the pack list use their preference profile. A new
          name gets added automatically.
        </p>
      </div>

      {(suggestions.length > 0 || manualItems.length > 0) && (
        <div className="rounded-xl border border-sky-800 bg-sky-950/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-sky-200">
              {matchedSurgeon?.name}'s preference card
            </p>
            <div className="flex rounded-full bg-slate-800 p-0.5 text-xs">
              {(["frequent", "recent"] as SuggestionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-2 py-1 font-medium ${
                    mode === m ? "bg-sky-600 text-white" : "text-slate-400"
                  }`}
                >
                  {m === "frequent" ? "Usual" : "Last case"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            From items actually logged in past {type === "KNEE" ? "knee" : "hip"} cases — uncheck
            anything that doesn't apply.
          </p>
          <div className="mt-2 space-y-1.5">
            {suggestions.map((s) => {
              const key = `${s.category}|${s.name}`;
              const on = enabled[key] ?? true;
              return (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setEnabled((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span className={on ? "" : "text-slate-500 line-through"}>
                    {s.name} ×{s.quantity}
                  </span>
                  <span className="text-xs text-slate-500">({s.casesUsedIn} case{s.casesUsedIn === 1 ? "" : "s"})</span>
                </label>
              );
            })}
            {manualItems.map((s, i) => (
              <p key={`m${i}`} className="flex items-center gap-2 text-sm text-slate-200">
                + {s.name} ×{s.quantity}
                <button
                  onClick={() => setManualItems((prev) => prev.filter((_, j) => j !== i))}
                  className="text-xs text-slate-500 underline"
                >
                  remove
                </button>
              </p>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Add another item..."
              className="min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <button
              onClick={() => {
                if (!manualName.trim()) return;
                setManualItems((prev) => [
                  ...prev,
                  { name: manualName.trim(), category: "implant", quantity: 1, casesUsedIn: 0 },
                ]);
                setManualName("");
              }}
              disabled={!manualName.trim()}
              className="min-h-0 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={saving || !facilityId || !time}
        className="w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white active:bg-sky-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Add case"}
      </button>
      <button onClick={() => onDone("")} className="w-full text-sm text-slate-500 underline">
        Cancel
      </button>
    </div>
  );
}

interface ImportRow {
  case_id: string | null;
  surgery_type: SurgeryType;
  side: Side | null;
  surgery_date: string;
  surgery_time: string | null;
  time_tba?: boolean;
  status?: "scheduled" | "completed";
  notes?: string | null;
  purchase_order_no?: string | null;
  invoice_no?: string | null;
  billing_status?: "none" | "po_received" | "invoiced";
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
  const [parsed, setParsed] = useState<ImportRow[]>([]);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState(lastFacilityId ?? "");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const surgicalFacilities = facilities.filter((f) => f.type === "hospital" || f.type === "surgery_center");

  useEffect(() => {
    if (!facilityId && surgicalFacilities.length > 0) {
      const last = surgicalFacilities.find((f) => f.id === lastFacilityId);
      setFacilityId(last?.id ?? surgicalFacilities[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, lastFacilityId, facilityId]);

  function onParse() {
    const all = parsePasteText(text);
    const { rows, duplicates } = dedupeByCaseId(all);
    setParsed(rows);
    setIncluded(rows.map(() => true));
    setDuplicates(duplicates);
    setCsvNote(null);
    setResult(null);
  }

  async function onCsvFile(file: File) {
    const content = await file.text();
    const res = parseMyopsCsv(content);
    if (res.error) {
      setCsvNote(res.error);
      setParsed([]);
      setIncluded([]);
      return;
    }
    const { rows, duplicates } = dedupeMyopsRows(res.rows);
    setParsed(rows);
    setIncluded(rows.map(() => true));
    setDuplicates(duplicates);
    const skipped: string[] = [];
    if (res.canceled > 0) skipped.push(`${res.canceled} canceled`);
    if (res.unrecognized > 0) skipped.push(`${res.unrecognized} unrecognized`);
    setCsvNote(
      `${rows.length} case${rows.length === 1 ? "" : "s"} found` +
        (skipped.length > 0 ? ` (skipped: ${skipped.join(", ")})` : "") +
        ". Patient names in the file are never imported.",
    );
    setResult(null);
  }

  async function onImport() {
    // Bulk paste comes off the myOPS schedule without times, so imported cases
    // land as TBA and show up in the day sheet's "Needs a time" bucket.
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
          time_tba: r.time_tba ?? false,
          status: r.status,
          notes: r.notes ?? null,
          purchase_order_no: r.purchase_order_no ?? null,
          invoice_no: r.invoice_no ?? null,
          billing_status: r.billing_status ?? "none",
          facility_id: facilityId,
          territory_id: territoryId,
          created_by: profileId,
        })),
      );
      await updateLastFacility(profileId, facilityId);
      setResult(res);
      setParsed([]);
      setText("");
      setCsvNote(null);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Upload the myOPS CSV export
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onCsvFile(f);
          }}
          className="w-full rounded-lg border border-dashed border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:font-medium file:text-white"
        />
        <p className="mt-1 text-xs text-slate-500">
          Reads date, time, type, side, status, alignment, and the loaner ship/return window.
          Canceled cases and patient names are skipped automatically.
        </p>
      </div>

      {csvNote && (
        <p className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
          {csvNote}
        </p>
      )}

      <p className="text-sm text-slate-400">
        ...or select case rows in myOPS, copy, and paste them below. We'll pull out the date, type,
        and side automatically — review before importing.
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
              {surgicalFacilities.map((f) => (
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
                  <th className="p-2">Status</th>
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
                    <td className="p-2 text-slate-500">
                      {row.status === "completed" ? "done" : "scheduled"}
                    </td>
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
