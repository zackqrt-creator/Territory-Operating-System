import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listCasesInRange, listCatalogItems, listFacilities, listInventory } from "../lib/api";
import type { CaseRow, CatalogItem, Facility, InventoryItem } from "../lib/types";
import {
  buildDayReadiness,
  sourcingAdvice,
  type ItemStatus,
  type ReadinessLine,
  type ReadinessSection,
} from "../lib/inventoryReadiness";
import { addDays, formatDateShort, tomorrow } from "../utils/dates";

const STATUS_META: Record<ItemStatus, { icon: string; label: string; text: string; ring: string }> = {
  ready: { icon: "✅", label: "Ready", text: "text-emerald-300", ring: "border-emerald-800 bg-emerald-950/20" },
  reserve: { icon: "⚠️", label: "Needs Lodi", text: "text-amber-300", ring: "border-amber-800 bg-amber-950/20" },
  short: { icon: "❌", label: "Short", text: "text-red-300", ring: "border-red-800 bg-red-950/30" },
};

export default function Readiness() {
  const [date, setDate] = useState(tomorrow());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([listCasesInRange(date, date), listCatalogItems(), listInventory(), listFacilities()])
      .then(([c, cat, inv, f]) => {
        setCases(c);
        setCatalog(cat);
        setInventory(inv);
        setFacilities(f);
      })
      .finally(() => setLoading(false));
  }, [date]);

  const readiness = useMemo(
    () => buildDayReadiness(date, cases, catalog, inventory, facilities),
    [date, cases, catalog, inventory, facilities],
  );

  const headline = STATUS_META[readiness.worstStatus === "none" ? "ready" : readiness.worstStatus];

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Am I ready?</h1>
        <Link to="/inventory" className="text-sm text-sky-400">
          Inventory &rarr;
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Every size you'd bring for a day's cases, checked against what you actually have —
        consignment and loaners combined — with the smartest way to cover any gap.
      </p>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-2 py-1">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="px-3 py-1 text-xl text-slate-400">
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-100">{formatDateShort(date)}</span>
        <button onClick={() => setDate((d) => addDays(d, 1))} className="px-3 py-1 text-xl text-slate-400">
          ›
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <>
          {readiness.totalCases > 0 ? (
            <div className={`mt-4 rounded-xl border p-4 ${headline.ring}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-100">
                    {readiness.worstStatus === "ready"
                      ? "You're set for the day"
                      : readiness.worstStatus === "reserve"
                        ? "Covered — but you'd tap Lodi"
                        : "You're short — action needed"}
                  </p>
                  <p className="text-sm text-slate-300">
                    {readiness.totalCases} case{readiness.totalCases === 1 ? "" : "s"} ·{" "}
                    {readiness.rightCases} right, {readiness.leftCases} left
                  </p>
                </div>
                <span className="text-3xl">{headline.icon}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
              No knee cases scheduled this day — showing your total inventory below.
            </p>
          )}

          <div className="mt-5 space-y-4">
            {readiness.sections.map((section) => (
              <SectionCard key={section.key} section={section} facilities={facilities} />
            ))}
          </div>

          <InventorySummaryCard summary={readiness.summary} />
        </>
      )}
    </div>
  );
}

function SectionCard({ section, facilities }: { section: ReadinessSection; facilities: Facility[] }) {
  const [open, setOpen] = useState(section.sizesShort > 0 || section.sizesReserve > 0);
  const sideLabel = section.side === "LEFT" ? "Left" : section.side === "RIGHT" ? "Right" : "";
  const total = section.lines.length;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-semibold text-slate-100">
            {sideLabel} {section.deviceType}
          </h2>
          <p className="text-sm text-slate-400">
            {section.sizesReady}/{total} sizes ready · need {section.demandPerSize} each
            {section.sizesReserve > 0 ? ` · ${section.sizesReserve} need Lodi` : ""}
            {section.sizesShort > 0 ? ` · ${section.sizesShort} short` : ""}
          </p>
        </div>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {section.lines.map((line) => (
            <LineRow key={line.catalogItem.id} line={line} facilities={facilities} />
          ))}
        </div>
      )}
    </div>
  );
}

function LineRow({ line, facilities }: { line: ReadinessLine; facilities: Facility[] }) {
  const meta = STATUS_META[line.status];
  const advice = sourcingAdvice(line, facilities);
  const size = line.catalogItem.size_label ?? "—";

  return (
    <div className={`rounded-lg border p-3 ${meta.ring}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-100">
          {meta.icon} Size {size}
        </p>
        <p className={`text-xs font-medium ${meta.text}`}>
          have {line.totalAvail} / need {line.demand}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {line.consignmentAvail} consignment
        {line.loanerAvail > 0 ? ` · ${line.loanerAvail} loaner` : ""}
        {line.reserveAvail > 0 ? ` · ${line.reserveAvail} at Lodi` : ""}
      </p>
      {advice && <p className={`mt-1 text-xs ${meta.text}`}>{advice}</p>}
    </div>
  );
}

function InventorySummaryCard({ summary }: { summary: ReturnType<typeof buildDayReadiness>["summary"] }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Total inventory</h2>
      <p className="mt-1 text-3xl font-bold text-slate-100">{summary.totalUnits}</p>
      <p className="text-sm text-slate-400">
        {summary.consignmentUnits} consignment · {summary.loanerUnits} loaner
      </p>
      {summary.byLocation.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {summary.byLocation.map((row) => (
            <div key={row.facility.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">
                {row.isReserve ? "🔒 " : ""}
                {row.facility.name}
              </span>
              <span className="font-medium text-slate-200">{row.units}</span>
            </div>
          ))}
        </div>
      )}
      <Link to="/inventory" className="mt-3 inline-block text-sm text-sky-400">
        Browse full inventory &rarr;
      </Link>
    </div>
  );
}
