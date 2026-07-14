import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listCasesInRange,
  listCaseTemplatesWithItems,
  listFacilities,
  listInventory,
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { computeReadiness } from "../lib/readiness";
import ReadinessSheet from "../components/ReadinessSheet";
import {
  addDays,
  formatWeekRange,
  isToday,
  nextWednesday,
  weekDays,
  weekStart,
} from "../utils/dates";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  const [wStart, setWStart] = useState(() => weekStart(nextWednesday()));
  const [selectedDate, setSelectedDate] = useState(() => nextWednesday());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCase, setOpenCase] = useState<CaseRow | null>(null);

  const days = useMemo(() => weekDays(wStart), [wStart]);

  function refresh() {
    setLoading(true);
    return Promise.all([
      listCasesInRange(days[0], days[6]),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listInventory(),
    ])
      .then(([c, f, t, i]) => {
        setCases(c);
        setFacilities(f);
        setTemplates(t);
        setInventory(i);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wStart]);

  function goWeek(delta: number) {
    setWStart((w) => addDays(w, delta * 7));
  }

  const casesByDay = useMemo(() => {
    const map = new Map<string, CaseRow[]>();
    for (const c of cases) {
      const list = map.get(c.surgery_date) ?? [];
      list.push(c);
      map.set(c.surgery_date, list);
    }
    return map;
  }, [cases]);

  function dayStatus(date: string): "ready" | "gap" | "none" {
    const dayCases = casesByDay.get(date) ?? [];
    if (dayCases.length === 0) return "none";
    let anyGap = false;
    for (const c of dayCases) {
      const r = computeReadiness(c, templates, inventory, facilities);
      if (r.applicable && r.overallStatus !== "ready") anyGap = true;
    }
    return anyGap ? "gap" : "ready";
  }

  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";
  const selectedCases = casesByDay.get(selectedDate) ?? [];

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Calendar</h1>
        <Link to="/cases/new" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white">
          + Add
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => goWeek(-1)} className="px-2 py-1 text-xl text-slate-400">
          ‹
        </button>
        <span className="text-sm font-medium text-slate-300">{formatWeekRange(wStart)}</span>
        <button onClick={() => goWeek(1)} className="px-2 py-1 text-xl text-slate-400">
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map((date, i) => {
          const status = dayStatus(date);
          const selected = date === selectedDate;
          const emphasize = i === 3 || i === 5; // Wed, Fri — the primary case days
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center rounded-lg py-2 ${
                selected
                  ? "bg-sky-600 text-white"
                  : emphasize
                    ? "bg-slate-800 text-slate-200"
                    : "bg-slate-900 text-slate-500"
              } ${isToday(date) && !selected ? "ring-1 ring-sky-500" : ""}`}
            >
              <span className="text-[10px]">{DAY_LABEL[i]}</span>
              <span className="text-sm font-medium">{Number(date.slice(-2))}</span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  status === "gap"
                    ? "bg-red-500"
                    : status === "ready"
                      ? "bg-emerald-500"
                      : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : selectedCases.length === 0 ? (
        <p className="mt-8 text-slate-400">No cases on this day.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {selectedCases.map((c) => {
            const readiness = computeReadiness(c, templates, inventory, facilities);
            const flagged = readiness.applicable && readiness.overallStatus !== "ready";
            return (
              <button
                key={c.id}
                onClick={() => setOpenCase(c)}
                className={`w-full rounded-lg border p-3 text-left active:bg-slate-800 ${
                  flagged ? "border-red-800 bg-red-950/30" : "border-slate-700 bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">
                    {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instrument"}
                    {c.variant === "partial" ? " · Partial" : ""}
                    {c.side ? ` · ${c.side === "LEFT" ? "L" : "R"}` : ""}
                  </span>
                  <span className="text-lg">
                    {!readiness.applicable ? "" : flagged ? "⚠️" : "✅"}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{facilityName(c.facility_id)}</p>
                {c.status === "completed" && (
                  <span className="mt-1 inline-block rounded bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">
                    Done
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {openCase && (
        <ReadinessSheet
          caseRow={openCase}
          templates={templates}
          inventory={inventory}
          facilities={facilities}
          onClose={() => setOpenCase(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
