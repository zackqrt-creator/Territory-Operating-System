import { useEffect, useMemo, useState } from "react";
import {
  listCasesInRange,
  listCaseTemplatesWithItems,
  listFacilities,
  listInventory,
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { buildStagingReport, type HaulItem, type LoanerReturn } from "../lib/staging";
import MoveItemSheet from "../components/MoveItemSheet";
import { addDays, daysUntil, formatDateShort, tomorrow } from "../utils/dates";

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Consumable",
};

export default function StagingReport() {
  const [date, setDate] = useState(tomorrow());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<{ item: InventoryItem; target: Facility } | null>(null);

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

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const report = useMemo(
    () => buildStagingReport(date, cases, templates, inventory, facilities, daysUntil),
    [date, cases, templates, inventory, facilities],
  );

  function onMoveDone() {
    setMoving(null);
    refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Staging report</h1>
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
          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-300">
              Haul list {report.cases.length > 0 && `· ${report.cases.length} case${report.cases.length === 1 ? "" : "s"}`}
            </h2>
            {report.cases.length === 0 ? (
              <p className="text-sm text-slate-500">No cases scheduled this day.</p>
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
                    <p className="font-medium text-white">
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

function HaulItemRow({ item, onMove }: { item: HaulItem; onMove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm text-white">
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
        <p className="text-sm font-medium text-white">{r.item.name}</p>
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
