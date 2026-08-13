import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  PackageCheck,
  TrendingDown,
} from "lucide-react";
import {
  listCasesInRange,
  listCatalogItems,
  listFacilities,
  listInventory,
  listRecentMovements,
} from "../lib/api";
import type { CaseRow, CatalogItem, Facility, InventoryItem, Movement } from "../lib/types";
import {
  buildDayReadiness,
  sourcingAdvice,
  type DayReadiness,
  type ItemStatus,
  type ReadinessLine,
  type ReadinessSection,
} from "../lib/inventoryReadiness";
import { addDays, formatDateShort, toISODate } from "../utils/dates";

const STATUS_META: Record<ItemStatus, { icon: string; label: string; text: string; ring: string }> = {
  ready: { icon: "✓", label: "Covered", text: "text-emerald-300", ring: "border-emerald-800 bg-emerald-950/20" },
  reserve: { icon: "!", label: "Needs reserve", text: "text-amber-300", ring: "border-amber-800 bg-amber-950/20" },
  short: { icon: "×", label: "Short", text: "text-red-300", ring: "border-red-800 bg-red-950/30" },
};

const STATUS_RANK: Record<ItemStatus | "none", number> = { none: 0, ready: 1, reserve: 2, short: 3 };

interface UsageRow {
  item: InventoryItem;
  quantity: number;
  lastUsedAt: string;
}

/**
 * The inventory command center: what is coming, whether stock covers it, and
 * what recent cases consumed. Detailed size runs remain one tap below the
 * seven-day horizon rather than competing with the morning decision.
 */
export default function Readiness() {
  const today = toISODate(new Date());
  const horizonEnd = addDays(today, 6);
  const [date, setDate] = useState(today);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listCasesInRange(today, horizonEnd),
      listCatalogItems(),
      listInventory(),
      listFacilities(),
      listRecentMovements(250),
    ])
      .then(([c, cat, inv, f, m]) => {
        setCases(c);
        setCatalog(cat);
        setInventory(inv);
        setFacilities(f);
        setMovements(m);
      })
      .finally(() => setLoading(false));
  }, [today, horizonEnd]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(today, offset);
      return buildDayReadiness(day, cases, catalog, inventory, facilities);
    });
  }, [today, cases, catalog, inventory, facilities]);

  const selected = days.find((day) => day.date === date) ?? days[0];
  const scheduledCases = cases.filter((c) => c.status === "scheduled");
  const problemDays = days.filter((day) => day.worstStatus === "short" || day.worstStatus === "reserve");
  const firstProblem = [...problemDays].sort(
    (a, b) => STATUS_RANK[b.worstStatus] - STATUS_RANK[a.worstStatus] || a.date.localeCompare(b.date),
  )[0];
  const usage = useMemo(() => buildRecentUsage(movements, inventory), [movements, inventory]);

  if (loading) {
    return <div className="min-h-screen px-4 pb-24 pt-6 text-slate-400">Loading coverage...</div>;
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-400">
            Seven-day outlook
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Inventory coverage</h1>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">
            What is coming, what is covered, and what recent cases took off the shelf.
          </p>
        </div>
        <Link
          to="/inventory"
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-sky-300"
        >
          On hand
        </Link>
      </header>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/55">
        <div className="grid grid-cols-3 divide-x divide-slate-700 border-b border-slate-700">
          <Metric value={scheduledCases.length} label="surgeries" />
          <Metric value={selected.summary.totalUnits} label="units on hand" />
          <Metric value={problemDays.length} label="days need action" urgent={problemDays.length > 0} />
        </div>
        <div className="p-4">
          {firstProblem ? (
            <button onClick={() => setDate(firstProblem.date)} className="flex w-full items-center gap-3 text-left">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${firstProblem.worstStatus === "short" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>
                <AlertTriangle className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-100">
                  {firstProblem.worstStatus === "short" ? "Confirmed inventory gap" : "Reserve stock may be needed"}
                </span>
                <span className="block text-xs text-slate-400">
                  {formatDateShort(firstProblem.date)} · tap to see the exact sizes
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
            </button>
          ) : scheduledCases.length > 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <Check className="h-4 w-4" /> No size-level shortages found in the next seven days.
            </p>
          ) : (
            <p className="text-sm text-slate-400">No surgeries scheduled in the next seven days.</p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Surgical horizon</h2>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {days.map((day, index) => (
            <DayButton key={day.date} day={day} selected={day.date === selected.date} today={index === 0} onSelect={setDate} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{formatDateShort(selected.date)}</h2>
            <p className="text-sm text-slate-400">
              {selected.totalCases === 0
                ? "No surgery demand"
                : `${selected.totalCases} case${selected.totalCases === 1 ? "" : "s"} · ${selected.leftCases} left · ${selected.rightCases} right`}
            </p>
          </div>
          {selected.totalCases > 0 && (
            <Link to={`/runsheet?date=${selected.date}`} className="text-sm font-medium text-sky-400">
              Run sheet →
            </Link>
          )}
        </div>

        {selected.totalCases === 0 ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
            Pick another day above to inspect its coverage.
          </div>
        ) : selected.sections.length === 0 ? (
          <div className="mt-3 rounded-xl border border-amber-800 bg-amber-950/25 p-4">
            <p className="text-sm font-medium text-amber-200">No sized catalog requirements were found.</p>
            <p className="mt-1 text-xs text-amber-300/80">
              The cases exist, but their product catalog or size run still needs configuration.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {selected.sections.map((section) => (
              <SectionCard key={section.key} section={section} facilities={facilities} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recently used</h2>
        </div>
        {usage.length === 0 ? (
          <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">No case usage has been logged recently.</p>
            <p className="mt-1 text-xs text-slate-500">Complete a case from its run sheet to deduct implants and efficiency items.</p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-slate-700 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/40">
            {usage.slice(0, 6).map((row) => (
              <div key={row.item.id} className="flex items-center gap-3 px-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-amber-300">
                  <TrendingDown className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{row.item.name}</span>
                  <span className="block text-xs text-slate-500">Lot {row.item.lot_number ?? "not recorded"}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-amber-300">−{row.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-7 grid grid-cols-2 gap-2">
        <Link to="/inventory" className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
          <PackageCheck className="h-5 w-5 text-sky-300" />
          <p className="mt-2 text-sm font-semibold text-slate-100">Count inventory</p>
          <p className="mt-0.5 text-xs text-slate-500">Correct locations and quantities</p>
        </Link>
        <Link to={`/runsheet?date=${selected.date}`} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
          <ClipboardList className="h-5 w-5 text-sky-300" />
          <p className="mt-2 text-sm font-semibold text-slate-100">Work the day</p>
          <p className="mt-0.5 text-xs text-slate-500">Cases, readiness, and usage</p>
        </Link>
      </section>
    </div>
  );
}

function Metric({ value, label, urgent = false }: { value: number; label: string; urgent?: boolean }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${urgent ? "text-red-300" : "text-slate-100"}`}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function DayButton({ day, selected, today, onSelect }: { day: DayReadiness; selected: boolean; today: boolean; onSelect: (date: string) => void }) {
  const status = day.worstStatus;
  const dot = status === "short" ? "bg-red-400" : status === "reserve" ? "bg-amber-400" : day.totalCases > 0 ? "bg-emerald-400" : "bg-slate-700";
  const d = new Date(`${day.date}T12:00:00`);
  return (
    <button
      onClick={() => onSelect(day.date)}
      aria-label={`${formatDateShort(day.date)}, ${day.totalCases} cases`}
      className={`min-h-0 rounded-xl border px-1 py-2 text-center ${selected ? "border-sky-600 bg-sky-950/35" : "border-slate-800 bg-slate-900/45"}`}
    >
      <span className="block text-[9px] font-semibold uppercase text-slate-500">{today ? "Now" : d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
      <span className="mt-0.5 block text-sm font-bold text-slate-200">{d.getDate()}</span>
      <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${dot}`} />
    </button>
  );
}

function SectionCard({ section, facilities }: { section: ReadinessSection; facilities: Facility[] }) {
  const [open, setOpen] = useState(section.sizesShort > 0 || section.sizesReserve > 0);
  const sideLabel = section.side === "LEFT" ? "Left" : section.side === "RIGHT" ? "Right" : "";
  const problem = section.sizesShort > 0 || section.sizesReserve > 0;
  return (
    <div className={`rounded-xl border p-4 ${problem ? "border-slate-700 bg-slate-900/55" : "border-emerald-900/60 bg-emerald-950/10"}`}>
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-100">{sideLabel} {section.deviceType}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {section.sizesReady}/{section.lines.length} sizes covered
            {section.sizesReserve > 0 ? ` · ${section.sizesReserve} reserve` : ""}
            {section.sizesShort > 0 ? ` · ${section.sizesShort} short` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${section.sizesShort > 0 ? "bg-red-500/15 text-red-300" : section.sizesReserve > 0 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
          {section.sizesShort > 0 ? "ACTION" : section.sizesReserve > 0 ? "CHECK" : "COVERED"}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{section.lines.map((line) => <LineRow key={line.catalogItem.id} line={line} facilities={facilities} />)}</div>}
    </div>
  );
}

function LineRow({ line, facilities }: { line: ReadinessLine; facilities: Facility[] }) {
  const meta = STATUS_META[line.status];
  const advice = sourcingAdvice(line, facilities);
  return (
    <div className={`rounded-lg border p-3 ${meta.ring}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-100"><span className={meta.text}>{meta.icon}</span> Size {line.catalogItem.size_label ?? "—"}</p>
        <p className={`text-xs font-semibold tabular-nums ${meta.text}`}>have {line.totalAvail} / need {line.demand}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{line.consignmentAvail} consignment{line.loanerAvail > 0 ? ` · ${line.loanerAvail} loaner` : ""}{line.reserveAvail > 0 ? ` · ${line.reserveAvail} reserve` : ""}</p>
      {advice && <p className={`mt-1.5 text-xs leading-relaxed ${meta.text}`}>{advice}</p>}
    </div>
  );
}

function buildRecentUsage(movements: Movement[], inventory: InventoryItem[]): UsageRow[] {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const used = new Map<string, UsageRow>();
  for (const movement of movements) {
    if (new Date(movement.created_at).getTime() < since) continue;
    const match = movement.note?.match(/^Used (\d+) in case$/i);
    const item = inventoryById.get(movement.item_id);
    if (!match || !item) continue;
    const current = used.get(item.id);
    used.set(item.id, {
      item,
      quantity: (current?.quantity ?? 0) + Number(match[1]),
      lastUsedAt: current && current.lastUsedAt > movement.created_at ? current.lastUsedAt : movement.created_at,
    });
  }
  return [...used.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}
