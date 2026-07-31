import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Stethoscope,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Truck,
  RotateCcw,
  Package,
  CheckSquare,
  Activity as ActivityIcon,
  CalendarDays,
  ArrowRight,
  MessageSquare,
  ChevronRight,
  type LucideIcon,
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
  listBoardPosts,
  listCatalogItems,
  listRepCertifications,
  listMyTasks,
} from "../lib/api";
import type {
  BoardPost,
  CaseRow,
  CatalogItem,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  Movement,
  PersonalTask,
  Profile,
  RepCertification,
} from "../lib/types";
import { buildStagingReport } from "../lib/staging";
import { buildLoanerReport } from "../lib/loaners";
import { buildActivityFeed } from "../lib/activity";
import { daysUntil, formatDateShort, formatTimeOfDay, toISODate, tomorrow } from "../utils/dates";
import { expiringLotSuggestions, scoreCase } from "../lib/crm";
import { computeReadiness } from "../lib/readiness";

export default function Home() {
  const { profile } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activityCases, setActivityCases] = useState<CaseRow[]>([]);
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [certs, setCerts] = useState<RepCertification[]>([]);
  const [myTasks, setMyTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    return Promise.all([
      listUpcomingCases(),
      listInventory(),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listRecentMovements(50),
      listProfiles(),
      listBoardPosts(),
      listCatalogItems(),
      listRepCertifications(),
      listMyTasks(),
    ]).then(async ([c, i, f, t, m, p, b, cat, rc, mt]) => {
      setCases(c);
      setItems(i);
      setFacilities(f);
      setTemplates(t);
      setMovements(m);
      setProfiles(p);
      setBoardPosts(b);
      setCatalog(cat);
      setCerts(rc);
      setMyTasks(mt);
      const caseIds = [...new Set(m.map((row) => row.related_case_id).filter((id): id is string => !!id))];
      setActivityCases(await listCasesByIds(caseIds));
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const loanerReport = buildLoanerReport(items, cases, templates, facilities, daysUntil, toISODate(new Date()));
  const urgentLoaners = loanerReport.filter((s) => s.urgency === "overdue" || s.urgency === "urgent");

  const staging = useMemo(
    () => buildStagingReport(tomorrow(), cases, templates, items, facilities, daysUntil),
    [cases, templates, items, facilities],
  );
  const haulCount = staging.routes.reduce((sum, r) => sum + r.items.length, 0);

  const todayCases = cases.filter((c) => c.surgery_date === today && c.status === "scheduled");

  // Case-day autopilot: everything tomorrow needs, scored, in one card.
  const tomorrowISO = tomorrow();
  const tomorrowCases = cases.filter(
    (c) => c.surgery_date === tomorrowISO && c.status === "scheduled",
  );
  const tomorrowScores = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 };
    for (const c of tomorrowCases) {
      const r = computeReadiness(c, templates, items, facilities);
      counts[scoreCase(c, r, items, certs).color]++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, templates, items, facilities, certs]);
  const loanersInTransit = items.filter(
    (i) => i.delivery_status && i.delivery_status !== "delivered",
  ).length;
  const activity = buildActivityFeed(movements, items, facilities, profiles, activityCases);
  const reserveAlerts = activity.filter((entry) => entry.reserveAlert && !entry.movement.acknowledged_at);

  const openTodos = boardPosts.filter(
    (p) => p.kind === "todo" && p.assignee_id === profile?.id && !p.done,
  );
  const mentions = boardPosts.filter((p) => profile && p.mentioned_ids.includes(profile.id));
  const wallSeen = localStorage.getItem("ct_wall_seen") ?? "";
  const newPosts = boardPosts.filter((p) => p.created_at > wallSeen).length;

  // Expiry safety: never implant an expired device. Loaner-tote wrappers excluded.
  const expiryFlags = items.filter(
    (i) => i.expiration_date && !i.loaner_code && daysUntil(i.expiration_date) <= 30,
  );
  const expiredCount = expiryFlags.filter((i) => daysUntil(i.expiration_date!) < 0).length;

  // Tasks needing attention now: overdue or due today, not done.
  const urgentTasks = myTasks.filter(
    (t) => t.status !== "done" && t.due_date && daysUntil(t.due_date) <= 0,
  ).length;

  const lotSuggestions = expiringLotSuggestions(
    items,
    cases,
    (id) => {
      const c = catalog.find((x) => x.id === id);
      return { joint: c?.joint ?? null, side: c?.side ?? null };
    },
    today,
  ).filter((s) => s.candidateCase);

  async function onAcknowledge(movementId: string) {
    if (!profile) return;
    await acknowledgeMovement(movementId, profile.id);
    await refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      {/*
       * Header: date, then greeting, then what the day holds. Reading order
       * matches the question being asked -- "what have I got today" -- rather
       * than leading with the product's own name, which the rep already knows.
       */}
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
          <p className="mt-1 text-sm text-slate-500">Here's what needs attention today.</p>
        </div>
        <BrandMark className="mt-1 h-9 w-9 shrink-0" />
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/*
           * Four counts, because they are the four things that can ruin a day:
           * what is on, what is not covered, what has run down, and what has to
           * go back. Each is a link -- a number you cannot act on is trivia.
           */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={CalendarDays}
              tone="neutral"
              label="Today's cases"
              value={todayCases.length}
              detail={`${new Set(todayCases.map((c) => c.facility_id)).size} ${
                new Set(todayCases.map((c) => c.facility_id)).size === 1 ? "hospital" : "hospitals"
              }`}
              action="View schedule"
              to="/cases"
            />
            <StatCard
              icon={AlertTriangle}
              tone="danger"
              label="Cases at risk"
              value={tomorrowScores.red}
              detail="Missing required inventory"
              action="Resolve now"
              to="/readiness"
            />
            <StatCard
              icon={RotateCcw}
              tone="warn"
              label="Replenishment"
              value={expiryFlags.length}
              detail={expiredCount > 0 ? `${expiredCount} already expired` : "Lots expiring soon"}
              action="Review queue"
              to="/inventory"
            />
            <StatCard
              icon={Truck}
              tone="info"
              label="Loaners due"
              value={urgentLoaners.length}
              detail={haulCount > 0 ? `${haulCount} to haul tomorrow` : "Nothing outstanding"}
              action="View loaners"
              to="/loaners"
            />
          </div>

          <Link
            to="/cases/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-sky-600/25 active:bg-sky-700"
          >
            <Plus className="h-5 w-5" /> Add case
          </Link>

          {/* ── Needs attention ─────────────────────────────── */}
          {(reserveAlerts.length > 0 ||
            expiryFlags.length > 0 ||
            tomorrowScores.red > 0 ||
            urgentLoaners.length > 0 ||
            urgentTasks > 0) && (
            <section>
              <SectionHeader icon={ShieldAlert} title="Needs attention" tone="danger" />
              <div className="mt-2 space-y-2">
                {reserveAlerts.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-red-700 bg-red-950/50 p-3">
                    <p className="flex items-start gap-2 text-sm text-red-100">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                      {entry.text}
                    </p>
                    <button
                      onClick={() => onAcknowledge(entry.movement.id)}
                      className="mt-2 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-medium text-white active:bg-red-700"
                    >
                      Mark replenished
                    </button>
                  </div>
                ))}

                {expiryFlags.length > 0 && (
                  <Link
                    to="/inventory"
                    className={`flex items-center justify-between rounded-xl border p-3 ${
                      expiredCount > 0 ? "border-red-800 bg-red-950/40" : "border-amber-800 bg-amber-950/25"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <AlertTriangle className={`h-4 w-4 shrink-0 ${expiredCount > 0 ? "text-red-300" : "text-amber-300"}`} />
                      <span className={expiredCount > 0 ? "text-red-100" : "text-amber-100"}>
                        {expiredCount > 0
                          ? `${expiredCount} expired item${expiredCount === 1 ? "" : "s"} in stock`
                          : `${expiryFlags.length} item${expiryFlags.length === 1 ? "" : "s"} expiring soon`}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </Link>
                )}

                {tomorrowScores.red > 0 && (
                  <Link
                    to={`/runsheet?date=${tomorrowISO}`}
                    className="flex items-center justify-between rounded-xl border border-red-800 bg-red-950/30 p-3"
                  >
                    <span className="flex items-center gap-2 text-sm text-red-100">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" />
                      {tomorrowScores.red} case{tomorrowScores.red === 1 ? "" : "s"} at risk tomorrow
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </Link>
                )}

                {urgentLoaners.length > 0 && (
                  <Link
                    to="/loaners"
                    className="rounded-xl border border-red-800 bg-red-950/40 p-3"
                  >
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
                )}

                {urgentTasks > 0 && (
                  <Link
                    to="/tasks"
                    className="flex items-center justify-between rounded-xl border border-amber-800 bg-amber-950/25 p-3"
                  >
                    <span className="flex items-center gap-2 text-sm text-amber-100">
                      <CheckSquare className="h-4 w-4 shrink-0 text-amber-300" />
                      {urgentTasks} task{urgentTasks === 1 ? "" : "s"} due today or overdue
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* ── Today / Tomorrow ────────────────────────────── */}
          <section>
            <SectionHeader icon={CalendarDays} title="Schedule" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link to={`/runsheet?date=${today}`} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Today</p>
                <p className="mt-1 text-2xl font-bold text-slate-100">{todayCases.length}</p>
                <p className="text-xs text-slate-400">case{todayCases.length === 1 ? "" : "s"}</p>
              </Link>
              <Link to={`/runsheet?date=${tomorrowISO}`} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tomorrow</p>
                <p className="mt-1 text-2xl font-bold text-slate-100">{tomorrowCases.length}</p>
                <p className="flex flex-wrap gap-x-2 text-xs">
                  {tomorrowScores.green > 0 && <span className="text-emerald-400">{tomorrowScores.green} ready</span>}
                  {tomorrowScores.yellow > 0 && <span className="text-amber-400">{tomorrowScores.yellow} check</span>}
                  {tomorrowScores.red > 0 && <span className="text-red-400">{tomorrowScores.red} risk</span>}
                  {tomorrowCases.length === 0 && <span className="text-slate-400">nothing scheduled</span>}
                </p>
              </Link>
            </div>
            <Link to="/cases" className="mt-2 flex items-center gap-1 text-sm text-sky-400">
              Open calendar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>

          {/* ── Staging ─────────────────────────────────────── */}
          {tomorrowCases.length > 0 && (
            <section>
              <SectionHeader icon={Truck} title="Staging — tomorrow" />
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
                    {loanersInTransit > 0 ? ` · ${loanersInTransit} inbound` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
            </section>
          )}

          {/* ── Inventory pulse ─────────────────────────────── */}
          <section>
            <SectionHeader icon={Package} title="Inventory pulse" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Link to="/inventory" className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
                <p className="text-2xl font-bold text-slate-100">{items.length}</p>
                <p className="text-xs text-slate-400">tracked</p>
              </Link>
              <Link to="/inventory" className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
                <p className={`text-2xl font-bold ${expiryFlags.length > 0 ? "text-amber-300" : "text-slate-100"}`}>
                  {expiryFlags.length}
                </p>
                <p className="text-xs text-slate-400">expiring</p>
              </Link>
              <Link to="/loaners" className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 active:bg-slate-800">
                <p className="text-2xl font-bold text-slate-100">{loanersInTransit}</p>
                <p className="text-xs text-slate-400">inbound</p>
              </Link>
            </div>
            {lotSuggestions.length > 0 && (
              <div className="mt-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Clock className="h-3.5 w-3.5" /> Use these lots first
                </p>
                <div className="mt-1.5 space-y-1">
                  {lotSuggestions.slice(0, 3).map((sug) => (
                    <p key={sug.item.id} className="text-sm text-slate-300">
                      {sug.item.name}
                      {sug.item.lot_number ? ` (lot ${sug.item.lot_number})` : ""} — {sug.daysLeft}d ·
                      fits {formatDateShort(sug.candidateCase!.surgery_date)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Tasks & team ────────────────────────────────── */}
          <section>
            <SectionHeader icon={CheckSquare} title="Tasks & team" />
            <div className="mt-2 space-y-2">
              <Link
                to="/readiness"
                className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 active:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-sky-300" />
                  <span>
                    <span className="block font-medium text-slate-100">Am I ready?</span>
                    <span className="block text-xs text-slate-400">Every size, checked against stock</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
              <Link
                to="/team"
                className={`flex items-center justify-between rounded-xl border px-4 py-3 active:bg-slate-800 ${
                  openTodos.length > 0 ? "border-sky-800 bg-sky-950/30" : "border-slate-700 bg-slate-800/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-sky-300" />
                  <span>
                    <span className="block font-medium text-slate-100">Team board</span>
                    <span className="block text-xs text-slate-400">
                      {openTodos.length > 0
                        ? `${openTodos.length} to-do${openTodos.length === 1 ? "" : "s"} for you`
                        : newPosts > 0
                          ? `${newPosts} new post${newPosts === 1 ? "" : "s"}`
                          : mentions.length > 0
                            ? `${mentions.length} mention${mentions.length === 1 ? "" : "s"} you`
                            : "Hand-offs & to-dos"}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
            </div>
          </section>

          {/* ── Recent activity ─────────────────────────────── */}
          {activity.length > 0 && (
            <section>
              <SectionHeader icon={ActivityIcon} title="Recent activity" />
              <div className="mt-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                <ul className="space-y-2">
                  {activity.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                      <span>
                        {entry.text}
                        <span className="text-slate-500"> · {formatTimeOfDay(entry.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link to="/activity" className="mt-2 flex items-center gap-1 text-sm text-sky-400">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  tone = "default",
}: {
  icon: typeof Package;
  title: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone === "danger" ? "text-red-400" : "text-slate-400"}`} />
      <h2
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === "danger" ? "text-red-300" : "text-slate-400"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

/** Morning / afternoon / evening, so the greeting is not wrong by 3pm. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STAT_TONES = {
  neutral: "bg-sky-950 text-sky-400",
  danger: "bg-red-950 text-red-400",
  warn: "bg-amber-950 text-amber-400",
  info: "bg-violet-950 text-violet-400",
} as const;

/**
 * One number, and the one thing to do about it.
 *
 * The whole tile is the link, not just the text at the bottom -- on a phone the
 * text is a 90px target inside a 150px card, and missing it does nothing.
 */
function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  detail,
  action,
  to,
}: {
  icon: LucideIcon;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: number;
  detail: string;
  action: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900 p-3.5 active:bg-slate-800"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}
      >
        <Icon size={16} />
      </span>
      <p className="mt-2.5 text-[13px] font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-[2rem] font-semibold leading-none text-slate-100">{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{detail}</p>
      <span className="mt-2 text-[12px] font-medium text-sky-400">{action} →</span>
    </Link>
  );
}
