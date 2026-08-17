import { useEffect, useMemo, useState } from "react";
import { BarChart3, Package, Stethoscope, Building2, CheckSquare } from "lucide-react";
import {
  listCasesInRange,
  listFacilities,
  listInventory,
  listMyTasks,
  listRecentMovements,
  listSurgeons,
} from "../lib/api";
import type { CaseRow, Facility, InventoryItem, Movement, PersonalTask, Surgeon } from "../lib/types";
import {
  caseVolumeByFacility,
  caseVolumeBySurgeon,
  caseVolumeByWeek,
  replenishTaskStats,
  taskStats,
  topUsedItems,
  type DateRange,
} from "../lib/trends";
import { addDays, toISODate } from "../utils/dates";

const RANGES = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
] as const;

/**
 * The business-intelligence layer: what does the territory's history say,
 * not what does it need right now (that's Home). Everything here reads data
 * the app was already writing as a byproduct of normal use — no new capture,
 * no separate history table, just looking backward at cases, movements, and
 * tasks that already happened.
 */
export default function Trends() {
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]["days"]>(90);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [loading, setLoading] = useState(true);

  const range: DateRange = useMemo(() => {
    const today = toISODate(new Date());
    return { start: addDays(today, -rangeDays), end: today };
  }, [rangeDays]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listCasesInRange(range.start, range.end),
      // Movements are the transaction log this reads usage off — a wide
      // window since a rep logging a busy month can push past a small limit.
      listRecentMovements(2000),
      listInventory(),
      listMyTasks(),
      listFacilities(),
      listSurgeons(),
    ])
      .then(([c, m, i, t, f, s]) => {
        setCases(c);
        setMovements(m);
        setInventory(i);
        setTasks(t);
        setFacilities(f);
        setSurgeons(s);
      })
      .finally(() => setLoading(false));
  }, [range.start, range.end]);

  const byFacility = useMemo(() => caseVolumeByFacility(cases, facilities), [cases, facilities]);
  const bySurgeon = useMemo(() => caseVolumeBySurgeon(cases, surgeons), [cases, surgeons]);
  const byWeek = useMemo(() => caseVolumeByWeek(cases), [cases]);
  const usedItems = useMemo(() => topUsedItems(movements, inventory, range, 10), [movements, inventory, range]);
  const tasksStat = useMemo(() => taskStats(tasks, range), [tasks, range]);
  const replenishStat = useMemo(() => replenishTaskStats(tasks, range), [tasks, range]);

  const unitsUsed = usedItems.reduce((sum, r) => sum + r.unitsUsed, 0);
  const maxWeek = Math.max(1, ...byWeek.map((w) => w.count));

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-sky-400" />
        <h1 className="text-2xl font-bold text-slate-100">Trends</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        What the territory's history says — read-only, built off cases, usage, and task activity
        already logged.
      </p>

      <div className="mt-4 flex gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setRangeDays(r.days)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              rangeDays === r.days ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* ── KPI tiles ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            <KpiTile icon={Stethoscope} label="Cases" value={String(cases.length)} sub={`last ${rangeDays} days`} />
            <KpiTile icon={Package} label="Units used" value={String(unitsUsed)} sub={`across ${usedItems.length} products`} />
            <KpiTile
              icon={CheckSquare}
              label="Replenish on-time"
              value={replenishStat.onTimeRate == null ? "—" : `${Math.round(replenishStat.onTimeRate * 100)}%`}
              sub={`${replenishStat.completed} completed`}
            />
            <KpiTile icon={CheckSquare} label="Tasks open" value={String(tasksStat.open)} sub={`${tasksStat.overdue} overdue`} />
          </div>

          {/* ── Case volume by week ──────────────────────────── */}
          {byWeek.length > 0 && (
            <section>
              <SectionHeader icon={BarChart3} label="Case volume by week" />
              <div className="mt-2 flex items-end gap-1 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                {byWeek.map((w) => (
                  <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-sky-600"
                      style={{ height: `${Math.max(4, (w.count / maxWeek) * 64)}px` }}
                      title={`${w.weekStart}: ${w.count}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Top used products ────────────────────────────── */}
          <section>
            <SectionHeader icon={Package} label="Most-used products" />
            {usedItems.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nothing logged as used in this window yet — sticker-sheet and digital-ticket
                imports feed this.
              </p>
            ) : (
              <BarList
                rows={usedItems.map((r) => ({ key: r.itemId, label: r.name, count: r.unitsUsed }))}
              />
            )}
          </section>

          {/* ── Case volume by facility ──────────────────────── */}
          <section>
            <SectionHeader icon={Building2} label="Case volume by facility" />
            <BarList
              rows={byFacility.map((r) => ({
                key: r.subject?.id ?? "unassigned",
                label: r.subject?.name ?? "No facility on file",
                count: r.count,
              }))}
            />
          </section>

          {/* ── Case volume by surgeon ───────────────────────── */}
          <section>
            <SectionHeader icon={Stethoscope} label="Case volume by surgeon" />
            <BarList
              rows={bySurgeon.map((r) => ({
                key: r.subject?.id ?? "unassigned",
                label: r.subject?.name ?? "No surgeon on file",
                count: r.count,
              }))}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: typeof BarChart3; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h2>
    </div>
  );
}

/** One hue, ranked by magnitude — a sequential read, not a category
 * comparison, so a single fixed color is correct here rather than a
 * categorical palette. */
function BarList({ rows }: { rows: { key: string; label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-slate-500">Nothing in this window.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="mt-2 space-y-1.5">
      {rows.slice(0, 10).map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-slate-400">{r.label}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-sky-600" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-medium text-slate-300">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
