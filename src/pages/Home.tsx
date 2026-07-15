import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem, Movement, Profile } from "../lib/types";
import { buildStagingReport } from "../lib/staging";
import { buildLoanerReport } from "../lib/loaners";
import { buildActivityFeed } from "../lib/activity";
import { daysUntil, formatDateShort, formatTimeOfDay, toISODate, tomorrow } from "../utils/dates";

export default function Home() {
  const { profile, signOut } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activityCases, setActivityCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    return Promise.all([
      listUpcomingCases(),
      listInventory(),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listRecentMovements(50),
      listProfiles(),
    ]).then(async ([c, i, f, t, m, p]) => {
      setCases(c);
      setItems(i);
      setFacilities(f);
      setTemplates(t);
      setMovements(m);
      setProfiles(p);
      const caseIds = [...new Set(m.map((row) => row.related_case_id).filter((id): id is string => !!id))];
      setActivityCases(await listCasesByIds(caseIds));
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = cases.filter((c) => c.surgery_date >= today && c.status === "scheduled");
  const nextSevenDays = upcoming.filter((c) => daysUntil(c.surgery_date) <= 7);
  const loanerReport = buildLoanerReport(items, cases, templates, facilities, daysUntil, toISODate(new Date()));
  const urgentLoaners = loanerReport.filter((s) => s.urgency === "overdue" || s.urgency === "urgent");

  const staging = useMemo(
    () => buildStagingReport(tomorrow(), cases, templates, items, facilities, daysUntil),
    [cases, templates, items, facilities],
  );
  const haulCount = staging.routes.reduce((sum, r) => sum + r.items.length, 0);
  const activity = buildActivityFeed(movements, items, facilities, profiles, activityCases);
  const reserveAlerts = activity.filter((entry) => entry.reserveAlert && !entry.movement.acknowledged_at);

  async function onAcknowledge(movementId: string) {
    if (!profile) return;
    await acknowledgeMovement(movementId, profile.id);
    await refresh();
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 text-lg font-bold text-white shadow-lg shadow-sky-900/50">
            CT
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">CaseTrack</h1>
            <p className="text-sm text-slate-400">
              {profile ? `Hi, ${profile.display_name}` : "Loading..."}
            </p>
          </div>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 underline underline-offset-2">
          Sign out
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-6 space-y-4">
          {reserveAlerts.length > 0 && (
            <div className="rounded-xl border border-red-700 bg-red-950/50 p-4">
              <h2 className="text-sm font-medium text-red-200">🚨 Reserve storage was used</h2>
              <div className="mt-2 space-y-2">
                {reserveAlerts.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-red-950/40 p-2">
                    <p className="text-sm text-red-100">{entry.text}</p>
                    <button
                      onClick={() => onAcknowledge(entry.movement.id)}
                      className="mt-1 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-medium text-white active:bg-red-700"
                    >
                      Mark replenished
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            to="/cases/new"
            className="block rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-sky-950/60 active:from-sky-600 active:to-sky-700"
          >
            + Add case
          </Link>

          {staging.cases.length > 0 && (
            <Link
              to="/staging"
              className={`block rounded-xl border p-4 ${
                haulCount > 0 || staging.loanerReturns.length > 0
                  ? "border-amber-800 bg-amber-950/30"
                  : "border-emerald-800 bg-emerald-950/30"
              }`}
            >
              <h2 className="text-sm font-medium text-amber-200">
                Tomorrow's staging &mdash; {staging.cases.length} case
                {staging.cases.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 text-sm text-slate-200">
                {haulCount > 0 ? `${haulCount} item${haulCount === 1 ? "" : "s"} to haul` : "Everything staged"}
                {staging.loanerReturns.length > 0
                  ? ` · ${staging.loanerReturns.length} loaner${staging.loanerReturns.length === 1 ? "" : "s"} to ship`
                  : ""}
              </p>
              <span className="mt-2 inline-block text-sm text-amber-300">Open staging report &rarr;</span>
            </Link>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-medium text-slate-300">Next 7 days</h2>
            <p className="mt-1 text-3xl font-semibold text-white">{nextSevenDays.length}</p>
            <p className="text-sm text-slate-400">scheduled cases</p>
            <Link to="/cases" className="mt-2 inline-block text-sm text-sky-400">
              Open calendar &rarr;
            </Link>
          </div>

          {urgentLoaners.length > 0 && (
            <Link to="/loaners" className="block rounded-xl border border-red-800 bg-red-950/40 p-4">
              <h2 className="text-sm font-medium text-red-300">Loaners to ship soon</h2>
              <ul className="mt-2 space-y-1">
                {urgentLoaners.map((s) => (
                  <li key={s.item.id} className="text-sm text-red-200">
                    {s.item.name} &mdash; ship by {formatDateShort(s.effectiveDeadline)}
                  </li>
                ))}
              </ul>
              <span className="mt-2 inline-block text-sm text-red-300 underline">
                Open loaner returns &rarr;
              </span>
            </Link>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-medium text-slate-300">Inventory tracked</h2>
            <p className="mt-1 text-3xl font-semibold text-white">{items.length}</p>
            <p className="text-sm text-slate-400">items across all locations</p>
            <Link to="/inventory" className="mt-2 inline-block text-sm text-sky-400">
              Open inventory &rarr;
            </Link>
          </div>

          {activity.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300">Recent activity</h2>
              <ul className="mt-2 space-y-1.5">
                {activity.slice(0, 3).map((entry) => (
                  <li key={entry.id} className="text-sm text-slate-300">
                    {entry.icon} {entry.text}
                    <span className="text-slate-500"> · {formatTimeOfDay(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/activity" className="mt-2 inline-block text-sm text-sky-400">
                View all activity &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
