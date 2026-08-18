import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ShieldAlert,
  AlertTriangle,
  Check,
  Truck,
  RotateCcw,
  ScanLine,
  CheckSquare,
  CalendarDays,
  ArrowRight,
  ChevronRight,
  WifiOff,
} from "lucide-react";
import BrandMark from "../components/BrandMark";
import { useAuth } from "../hooks/useAuth";
import {
  listUpcomingCases,
  listInventory,
  listFacilities,
  listCaseTemplatesWithItems,
  listRecentMovements,
  listProfiles,
  listCasesByIds,
  acknowledgeMovement,
  listMyTasks,
} from "../lib/api";
import type {
  CaseRow,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  Movement,
  PersonalTask,
  Profile,
} from "../lib/types";
import { buildStagingReport } from "../lib/staging";
import { buildLoanerReport } from "../lib/loaners";
import { buildActivityFeed } from "../lib/activity";
import { daysUntil, formatDateShort, toISODate, tomorrow } from "../utils/dates";
import { scoreCase } from "../lib/crm";
import { computeReadiness } from "../lib/readiness";

/**
 * Home answers one question: is anything wrong right now.
 *
 * Everything on this screen is either that answer or measured against it. The
 * counts, pulses and shortcut rows that used to live here said the same three
 * numbers four times each and turned the screen into three screens stacked --
 * a dashboard, an alert list and a launcher. The launcher is the bottom nav;
 * the dashboard was a duplicate of the alerts. What is left is the alerts, the
 * day's shape, and the two things a rep actually taps.
 */
export default function Home() {
  const { profile } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activityCases, setActivityCases] = useState<CaseRow[]>([]);
  const [myTasks, setMyTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  // Home's one job is telling you whether anything's wrong -- so a failed
  // fetch can never quietly resolve into "nothing's wrong". loadError gates
  // the all-clear message; lastSynced tells you how stale what's on screen
  // might be even after a successful load.
  const [loadError, setLoadError] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  function refresh() {
    return Promise.all([
      listUpcomingCases(),
      listInventory(),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listRecentMovements(50),
      listProfiles(),
      listMyTasks(),
    ])
      .then(async ([c, i, f, t, m, p, mt]) => {
        setCases(c);
        setItems(i);
        setFacilities(f);
        setTemplates(t);
        setMovements(m);
        setProfiles(p);
        setMyTasks(mt);
        const caseIds = [...new Set(m.map((row) => row.related_case_id).filter((id): id is string => !!id))];
        setActivityCases(await listCasesByIds(caseIds));
        setLoadError(false);
        setLastSynced(new Date());
      })
      .catch(() => {
        setLoadError(true);
      });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrowISO = tomorrow();

  const loanerReport = buildLoanerReport(items, cases, templates, facilities, daysUntil, toISODate(new Date()));
  const urgentLoaners = loanerReport.filter((s) => s.urgency === "overdue" || s.urgency === "urgent");

  const staging = useMemo(
    () => buildStagingReport(tomorrowISO, cases, templates, items, facilities, daysUntil),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cases, templates, items, facilities],
  );
  const haulCount = staging.routes.reduce((sum, r) => sum + r.items.length, 0);

  const todayCases = cases.filter((c) => c.surgery_date === today && c.status === "scheduled");
  const tomorrowCases = cases.filter((c) => c.surgery_date === tomorrowISO && c.status === "scheduled");

  /**
   * Score both days, not just tomorrow. A case going in this morning that is
   * short a size is the most urgent thing the app can know, and the old screen
   * had no way to say it.
   */
  const scores = useMemo(() => {
    const tally = (list: CaseRow[]) => {
      const counts = { green: 0, yellow: 0, red: 0 };
      for (const c of list) {
        const r = computeReadiness(c, templates, items, facilities);
        counts[scoreCase(c, r, items).color]++;
      }
      return counts;
    };
    return { today: tally(todayCases), tomorrow: tally(tomorrowCases) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, templates, items, facilities]);

  const activity = buildActivityFeed(movements, items, facilities, profiles, activityCases);
  const reserveAlerts = activity.filter((entry) => entry.reserveAlert && !entry.movement.acknowledged_at);

  // Expiry safety: never implant an expired device. Loaner-tote wrappers excluded.
  // Split so an already-expired device (a safety issue right now) outranks a
  // merely-expiring one (a heads-up for later) instead of the two blurring
  // into one count, as they used to.
  const expiredNow = items.filter(
    (i) => i.expiration_date && !i.loaner_code && daysUntil(i.expiration_date) < 0,
  );
  const expiringSoon = items.filter(
    (i) => i.expiration_date && !i.loaner_code && daysUntil(i.expiration_date) >= 0 && daysUntil(i.expiration_date) <= 30,
  );

  const urgentTasks = myTasks.filter(
    (t) => t.status !== "done" && t.due_date && daysUntil(t.due_date) <= 0,
  ).length;

  /**
   * Everything that could compete for "what do I do first" reduced to one
   * ranked list, by timing alone: how soon does waiting on this actually cost
   * something. A live misallocation right now outranks a device that expires
   * in three weeks even though both are technically "alerts" — the old
   * layout gave them the same visual weight and left the ordering to
   * whichever block happened to be coded first on the page.
   *
   * Lower weight = do it first. Ties keep their original relative order.
   */
  const PRIORITY = {
    reserveAlert: 0,
    expiredStock: 1,
    caseRiskToday: 2,
    overdueOrDueTask: 3,
    loanerShipSoon: 4,
    caseRiskTomorrow: 5,
    expiringSoon: 6,
  } as const;

  const priorityEntries: { key: string; weight: number; node: React.ReactNode }[] = [];

  for (const entry of reserveAlerts) {
    priorityEntries.push({
      key: `reserve-${entry.id}`,
      weight: PRIORITY.reserveAlert,
      node: (
        <div className="rounded-xl border border-red-700 bg-red-950/50 p-3">
          <p className="flex items-start gap-2 text-sm text-red-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            {entry.text}
          </p>
          <button
            onClick={() => onAcknowledge(entry.movement.id)}
            className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white active:bg-red-600"
          >
            Mark replenished
          </button>
        </div>
      ),
    });
  }

  if (expiredNow.length > 0) {
    priorityEntries.push({
      key: "expired-now",
      weight: PRIORITY.expiredStock,
      node: (
        <AlertRow
          to="/inventory"
          icon={AlertTriangle}
          tone="danger"
          text={`${expiredNow.length} expired item${expiredNow.length === 1 ? "" : "s"} in stock`}
        />
      ),
    });
  }

  if (scores.today.red > 0) {
    priorityEntries.push({
      key: "case-today",
      weight: PRIORITY.caseRiskToday,
      node: (
        <AlertRow
          to={`/runsheet?date=${today}`}
          icon={AlertTriangle}
          tone="danger"
          text={`${scores.today.red} case${scores.today.red === 1 ? "" : "s"} at risk today`}
        />
      ),
    });
  }

  if (urgentTasks > 0) {
    priorityEntries.push({
      key: "urgent-tasks",
      weight: PRIORITY.overdueOrDueTask,
      node: (
        <AlertRow
          to="/tasks"
          icon={CheckSquare}
          tone="warn"
          text={`${urgentTasks} task${urgentTasks === 1 ? "" : "s"} due today or overdue`}
        />
      ),
    });
  }

  if (urgentLoaners.length > 0) {
    priorityEntries.push({
      key: "urgent-loaners",
      weight: PRIORITY.loanerShipSoon,
      node: (
        <Link to="/loaners" className="block rounded-xl border border-red-800 bg-red-950/40 p-3">
          <span className="flex items-center gap-2 text-sm font-medium text-red-200">
            <RotateCcw className="h-4 w-4 shrink-0" /> Loaners to ship soon
          </span>
          <ul className="mt-1.5 space-y-0.5 pl-6">
            {urgentLoaners.slice(0, 3).map((s) => (
              <li key={s.item.id} className="text-sm text-red-200/90">
                {s.item.name} — ship by {formatDateShort(s.effectiveDeadline)}
              </li>
            ))}
          </ul>
        </Link>
      ),
    });
  }

  if (scores.tomorrow.red > 0) {
    priorityEntries.push({
      key: "case-tomorrow",
      weight: PRIORITY.caseRiskTomorrow,
      node: (
        <AlertRow
          to={`/runsheet?date=${tomorrowISO}`}
          icon={AlertTriangle}
          tone="danger"
          text={`${scores.tomorrow.red} case${scores.tomorrow.red === 1 ? "" : "s"} at risk tomorrow`}
        />
      ),
    });
  }

  if (expiringSoon.length > 0) {
    priorityEntries.push({
      key: "expiring-soon",
      weight: PRIORITY.expiringSoon,
      node: (
        <AlertRow
          to="/inventory"
          icon={AlertTriangle}
          tone="warn"
          text={`${expiringSoon.length} item${expiringSoon.length === 1 ? "" : "s"} expiring soon`}
        />
      ),
    });
  }

  priorityEntries.sort((a, b) => a.weight - b.weight);
  const hasAlerts = priorityEntries.length > 0;

  async function onAcknowledge(movementId: string) {
    if (!profile) return;
    await acknowledgeMovement(movementId, profile.id);
    await refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-40 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight text-slate-100">
            {greeting()}
            {profile ? `, ${profile.display_name.split(" ")[0]}` : ""}
          </h1>
        </div>
        <BrandMark className="mt-1 h-9 w-9 shrink-0" />
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-6 space-y-6">
          {loadError && (
            <div className="rounded-2xl border border-red-800 bg-red-950 p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-red-200">
                <WifiOff className="h-4 w-4 shrink-0" />
                Couldn't reach the server
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-red-300">
                {lastSynced
                  ? `Showing what loaded as of ${lastSynced.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} -- may be stale.`
                  : "Nothing has loaded yet this session."}{" "}
                <button onClick={() => refresh()} className="underline">
                  Retry
                </button>
              </p>
            </div>
          )}

          {/*
           * The database holds 931 catalogued products but only a handful of
           * rows saying anything is actually on a shelf. Everything that asks
           * "do I have enough" diffs against that, so with the shelf empty every
           * case reads as short and the app looks broken when it is in fact
           * reporting honestly. Say so, once, above the alerts it explains.
           */}
          {items.length < 10 && (
            <div className="rounded-2xl border border-amber-800 bg-amber-950 p-3.5">
              <p className="text-sm font-medium text-amber-200">
                {items.length === 0
                  ? "No stock recorded yet"
                  : `Only ${items.length} item${items.length === 1 ? "" : "s"} recorded as on hand`}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-300">
                Shortage warnings below are measured against that, not against what is really in
                your car and at your facilities. They will settle down as stock goes in.
              </p>
            </div>
          )}

          {/*
           * The datum. If something is wrong it is the first thing on the
           * screen and nothing competes with it for the top.
           */}
          {hasAlerts ? (
            <section>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-red-300">
                  Do these first
                </h2>
              </div>
              <div className="mt-2 space-y-2">
                {priorityEntries.map((entry) => (
                  <div key={entry.key}>{entry.node}</div>
                ))}
              </div>
            </section>
          ) : loadError ? (
            /*
             * Silence only means good news when the app actually heard back.
             * On a failed fetch, silence means "didn't check" -- and saying so
             * is what makes the green check below mean something the rest of
             * the time.
             */
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <WifiOff className="h-4 w-4 shrink-0 text-red-400" />
              Can't confirm anything's clear until this reconnects.
            </p>
          ) : (
            /*
             * Silence has to mean good news, or the red above stops meaning
             * anything. One line, no celebration, no counts repeated from the
             * schedule below it.
             */
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              Nothing needs attention.
            </p>
          )}

          {/* ── The shape of the day ────────────────────────── */}
          <section>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Schedule</h2>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <DayTile label="Today" to={`/runsheet?date=${today}`} count={todayCases.length} scores={scores.today} />
              <DayTile
                label="Tomorrow"
                to={`/runsheet?date=${tomorrowISO}`}
                count={tomorrowCases.length}
                scores={scores.tomorrow}
              />
            </div>
            <Link to="/cases" className="mt-2 flex items-center gap-1 text-sm text-sky-400">
              Open calendar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/readiness"
              className="mt-3 flex items-center justify-between rounded-xl border border-sky-800/70 bg-sky-950/25 px-3 py-3 active:bg-sky-950/40"
            >
              <span>
                <span className="block text-sm font-semibold text-sky-200">Inventory coverage</span>
                <span className="block text-xs text-slate-500">Surgeries, shortages, and recent usage · 7 days</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-sky-400" />
            </Link>
          </section>

          {/* ── What goes in the car tonight ────────────────── */}
          {tomorrowCases.length > 0 && (
            <section>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Staging — tomorrow
                </h2>
              </div>
              <Link
                to={`/staging?date=${tomorrowISO}`}
                className="mt-2 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 p-4 active:bg-slate-800"
              >
                <div>
                  <p className="text-sm text-slate-200">
                    {haulCount > 0 ? `${haulCount} item${haulCount === 1 ? "" : "s"} to haul` : "Everything staged"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {staging.loanerReturns.length > 0
                      ? `${staging.loanerReturns.length} loaner${staging.loanerReturns.length === 1 ? "" : "s"} to ship`
                      : "No loaner returns"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
            </section>
          )}
        </div>
      )}

      {/*
       * The two things a rep actually taps, pinned above the nav so they land
       * under the same thumb on every screen state. Scanning happens dozens of
       * times a day and adding a case a few times a week, so scanning gets the
       * width and the colour.
       *
       * Offset clears the bottom nav (h-8 icon + label + py-2 = 65px) plus the
       * home-indicator inset.
       */}
      <div
        className="fixed inset-x-0 z-10 border-t border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur-xl"
        style={{ bottom: "calc(65px + var(--safe-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <Link
            to="/scan"
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-sky-600/25 active:bg-sky-700"
          >
            <ScanLine className="h-5 w-5" /> Scan
          </Link>
          <Link
            to="/cases/new"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-3.5 text-sm font-semibold text-slate-200 active:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Case
          </Link>
        </div>
      </div>
    </div>
  );
}

const ALERT_TONES = {
  danger: "border-red-800 bg-red-950/40 text-red-100",
  warn: "border-amber-800 bg-amber-950/25 text-amber-100",
} as const;

const ALERT_ICON_TONES = {
  danger: "text-red-300",
  warn: "text-amber-300",
} as const;

/** One wrong thing, one place to go and fix it. */
function AlertRow({
  to,
  icon: Icon,
  tone,
  text,
}: {
  to: string;
  icon: typeof AlertTriangle;
  tone: keyof typeof ALERT_TONES;
  text: string;
}) {
  return (
    <Link to={to} className={`flex items-center justify-between rounded-xl border p-3 ${ALERT_TONES[tone]}`}>
      <span className="flex items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${ALERT_ICON_TONES[tone]}`} />
        {text}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
    </Link>
  );
}

/**
 * A day is a count and its breakdown. The breakdown is the same readiness the
 * alerts above are drawn from, so a red number here always has a row up there.
 */
function DayTile({
  label,
  to,
  count,
  scores,
}: {
  label: string;
  to: string;
  count: number;
  scores: { green: number; yellow: number; red: number };
}) {
  return (
    <Link to={to} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-100">{count}</p>
      <p className="flex flex-wrap gap-x-2 text-xs">
        {scores.green > 0 && <span className="text-emerald-400">{scores.green} ready</span>}
        {scores.yellow > 0 && <span className="text-amber-400">{scores.yellow} check</span>}
        {scores.red > 0 && <span className="text-red-400">{scores.red} risk</span>}
        {count === 0 && <span className="text-slate-400">nothing scheduled</span>}
      </p>
    </Link>
  );
}

/** Morning / afternoon / evening, so the greeting is not wrong by 3pm. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
