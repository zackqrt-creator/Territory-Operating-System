import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listCasesInRange,
  listCaseTemplatesWithItems,
  listDayChecklistMarks,
  listDayRequirements,
  listFacilities,
  listInventory,
  markDayItem,
  unmarkDayItem,
} from "../lib/api";
import type {
  CaseRow,
  CaseTemplateWithItems,
  DayChecklistMark,
  DayRequirement,
  Facility,
  InventoryItem,
} from "../lib/types";
import {
  buildStagingReport,
  type DayHaulItem,
  type HaulItem,
  type LoanerReturn,
} from "../lib/staging";
import MoveItemSheet from "../components/MoveItemSheet";
import { useAuth } from "../hooks/useAuth";
import { addDays, daysUntil, formatDateShort, tomorrow } from "../utils/dates";

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
};

export default function StagingReport() {
  const [params] = useSearchParams();
  const [date, setDate] = useState(() => params.get("date") ?? tomorrow());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<{ item: InventoryItem; target: Facility } | null>(null);
  const [dayReqs, setDayReqs] = useState<DayRequirement[]>([]);
  const [dayMarks, setDayMarks] = useState<DayChecklistMark[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { profile } = useAuth();

  function refresh() {
    setLoading(true);
    // Cases and loaner deadlines both matter beyond just the target day, so
    // pull a wide window once and let buildStagingReport filter/scope it.
    const start = addDays(date, -3);
    const end = addDays(date, 10);
    return Promise.all([
      listCasesInRange(start, end),
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

  // Separate from refresh() and silent on failure: before migration 051 these
  // tables do not exist, and the right behaviour then is a staging report with
  // no day section rather than a page that will not load.
  const refreshDay = useCallback(() => {
    listDayRequirements()
      .then(setDayReqs)
      .catch(() => setDayReqs([]));
    listDayChecklistMarks(date)
      .then(setDayMarks)
      .catch(() => setDayMarks([]));
  }, [date]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(refreshDay, [refreshDay]);

  const report = useMemo(
    () =>
      buildStagingReport(
        date,
        cases,
        templates,
        inventory,
        facilities,
        daysUntil,
        dayReqs,
        new Set(dayMarks.map((m) => m.item_key)),
      ),
    [date, cases, templates, inventory, facilities, dayReqs, dayMarks],
  );

  // Already have a 13-day window loaded for loaner-deadline lookback/lookahead
  // — reuse it so an empty day still points at whenever the next one is,
  // instead of just reporting nothing scheduled and stopping there.
  const nextDays = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const c of cases) {
      if (c.surgery_date > date) byDate.set(c.surgery_date, (byDate.get(c.surgery_date) ?? 0) + 1);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
  }, [cases, date]);

  async function toggleDayMark(key: string, currentlyMarked: boolean) {
    if (!profile) return;
    setBusyKey(key);
    try {
      if (currentlyMarked) {
        await unmarkDayItem(date, key);
      } else {
        await markDayItem({
          on_date: date,
          item_key: key,
          territory_id: profile.territory_id,
          marked_by: profile.id,
        });
      }
      refreshDay();
    } finally {
      setBusyKey(null);
    }
  }

  function onMoveDone() {
    setMoving(null);
    refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Staging report</h1>
      <p className="mt-1 text-sm text-slate-400">
        Everything to haul so tomorrow's cases are ready, and what needs to ship back before the
        week gets away from you.
      </p>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="px-2 py-1 text-xl text-slate-400">
          ‹
        </button>
        <span className="text-sm font-medium text-slate-200">{formatDateShort(date)}</span>
        <button onClick={() => setDate((d) => addDays(d, 1))} className="px-2 py-1 text-xl text-slate-400">
          ›
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-5 space-y-6">
          {report.dayItems.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-slate-300">Every surgery day</h2>
              <p className="mb-2 text-xs text-slate-500">
                Goes in the car once, however many cases are on the day.
              </p>
              <div className="space-y-2">
                {report.dayItems.map((item) => (
                  <DayLine
                    key={item.key}
                    item={item}
                    busy={busyKey === item.key}
                    canMark={!!profile}
                    onToggle={() => toggleDayMark(item.key, item.manuallyConfirmed)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-300">
              Haul list {report.cases.length > 0 && `· ${report.cases.length} case${report.cases.length === 1 ? "" : "s"}`}
            </h2>
            {report.cases.length === 0 ? (
              <div>
                <p className="text-sm text-slate-500">No cases scheduled this day.</p>
                {nextDays.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {nextDays.map(([d, count]) => (
                      <button
                        key={d}
                        onClick={() => setDate(d)}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-left active:bg-slate-800"
                      >
                        <span className="text-sm font-medium text-slate-200">{formatDateShort(d)}</span>
                        <span className="text-xs text-slate-500">
                          {count} case{count === 1 ? "" : "s"} →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Link
                  to="/cases/new"
                  className="mt-2 inline-block rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white"
                >
                  + Add a case
                </Link>
              </div>
            ) : report.routes.length === 0 ? (
              <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
                Everything needed is already at the right facility. ✅
              </p>
            ) : (
              <div className="space-y-3">
                {report.routes.map((route, i) => (
                  <div key={i} className="rounded-lg border border-amber-800 bg-amber-950/20 p-3">
                    <p className="font-medium text-amber-200">
                      {route.from.name} → {route.to.name}
                    </p>
                    <div className="mt-2 space-y-2">
                      {route.items.map((item, j) => (
                        <HaulItemRow
                          key={j}
                          item={item}
                          onMove={() => setMoving({ item: item.sampleItem, target: route.to })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {report.readyCount > 0 && (
            <section>
              <p className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
                {report.readyCount} item{report.readyCount === 1 ? "" : "s"} already staged in the
                right place.
              </p>
            </section>
          )}

          {report.missing.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-300">Not found anywhere</h2>
              <div className="space-y-2">
                {report.missing.map((m, i) => (
                  <div key={i} className="rounded-lg border border-red-800 bg-red-950/30 p-3">
                    {/* text-white was invisible: the light ramp defines red-950
                        as #fef2f2, so this was white on near-white. slate-100
                        is the ink in this theme. */}
                    <p className="font-medium text-slate-100">
                      {m.quantity}x {m.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {CATEGORY_LABEL[m.category]} · for {m.forCases.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-300">Ship back to corporate</h2>
            {report.loanerReturns.length === 0 ? (
              <p className="text-sm text-slate-500">No loaner deadlines coming up this week.</p>
            ) : (
              <div className="space-y-2">
                {report.loanerReturns.map((r) => (
                  <LoanerReturnRow
                    key={r.item.id}
                    r={r}
                    onMove={() => {
                      const corporate = facilities.find((f) => f.type === "corporate");
                      if (corporate) setMoving({ item: r.item, target: corporate });
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {moving && (
        <MoveItemSheet
          item={moving.item}
          facilities={facilities}
          initialTarget={moving.target}
          onClose={() => setMoving(null)}
          onMoved={onMoveDone}
        />
      )}
    </div>
  );
}

/**
 * A day line, ticked by hand rather than deducted from stock. It is deliberately
 * never green off the back of inventory: these are things the rep confirms are
 * in the car, and the catalog has no way to know whether they were loaded.
 */
function DayLine({
  item,
  busy,
  canMark,
  onToggle,
}: {
  item: DayHaulItem;
  busy: boolean;
  canMark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy || !canMark}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${
        item.manuallyConfirmed
          ? "border-sky-800 bg-sky-950/25"
          : "border-slate-700 bg-slate-800/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 min-h-0 shrink-0 items-center justify-center rounded border text-xs ${
          item.manuallyConfirmed
            ? "border-sky-600 bg-sky-900/60 text-sky-200"
            : "border-slate-600 text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-100">
          {item.quantity}x {item.name}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {CATEGORY_LABEL[item.category]}
          {item.locations.length > 0 &&
            ` · last seen at ${item.locations[0].facility.name}`}
        </span>
        {item.note && <span className="mt-1 block text-xs text-slate-400">{item.note}</span>}
      </span>
    </button>
  );
}

function HaulItemRow({ item, onMove }: { item: HaulItem; onMove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm text-slate-100">
          {item.quantity}x {item.name}
        </p>
        <p className="text-xs text-slate-500">
          {CATEGORY_LABEL[item.category]} · for {item.forCases.join(", ")}
        </p>
      </div>
      <button
        onClick={onMove}
        className="shrink-0 rounded-lg bg-amber-900/60 px-3 py-2 text-sm font-medium text-amber-100 active:bg-amber-900"
      >
        Move
      </button>
    </div>
  );
}

function LoanerReturnRow({ r, onMove }: { r: LoanerReturn; onMove: () => void }) {
  const urgent = r.daysLeft <= 2;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
        urgent ? "border-red-800 bg-red-950/30" : "border-slate-700 bg-slate-800/50"
      }`}
    >
      <div>
        <p className="text-sm font-medium text-slate-100">{r.item.name}</p>
        <p className={`text-xs ${urgent ? "text-red-300" : "text-slate-500"}`}>
          {r.facility.name} ·{" "}
          {r.daysLeft < 0
            ? `${-r.daysLeft}d overdue`
            : r.daysLeft === 0
              ? "ship today"
              : `ship within ${r.daysLeft}d`}
        </p>
      </div>
      <button
        onClick={onMove}
        className="shrink-0 rounded-lg bg-sky-900/60 px-3 py-2 text-sm font-medium text-sky-100 active:bg-sky-900"
      >
        Ship
      </button>
    </div>
  );
}
