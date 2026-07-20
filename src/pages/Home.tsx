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
  listBoardPosts,
  listFacilityCredentials,
  listCatalogItems,
} from "../lib/api";
import type {
  BoardPost,
  CaseRow,
  CatalogItem,
  FacilityCredential,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  Movement,
  Profile,
} from "../lib/types";
import { buildStagingReport } from "../lib/staging";
import { buildLoanerReport } from "../lib/loaners";
import { buildActivityFeed } from "../lib/activity";
import { daysUntil, formatDateShort, formatTimeOfDay, toISODate, tomorrow } from "../utils/dates";
import { credentialConflicts, expiringLotSuggestions } from "../lib/crm";

export default function Home() {
  const { profile, signOut } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activityCases, setActivityCases] = useState<CaseRow[]>([]);
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);
  const [credentials, setCredentials] = useState<FacilityCredential[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
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
      listFacilityCredentials(),
      listCatalogItems(),
    ]).then(async ([c, i, f, t, m, p, b, fc, cat]) => {
      setCases(c);
      setItems(i);
      setFacilities(f);
      setTemplates(t);
      setMovements(m);
      setProfiles(p);
      setBoardPosts(b);
      setCredentials(fc);
      setCatalog(cat);
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

  const doorChecks = credentialConflicts(credentials, cases, facilities, profiles, today);
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
          {doorChecks.length > 0 && (
            <Link to="/compliance" className="block rounded-xl border border-red-700 bg-red-950/50 p-4">
              <h2 className="text-sm font-medium text-red-200">🚪 Credential expires before a case</h2>
              {doorChecks.slice(0, 2).map((d) => (
                <p key={d.credential.id} className="mt-1 text-sm text-red-100">
                  {d.credential.vendor} at {d.facility.name} lapses {formatDateShort(d.credential.expires_on)} — case there {formatDateShort(d.firstAffectedCase.surgery_date)}.
                </p>
              ))}
              <span className="mt-1 inline-block text-sm text-red-300 underline">Open compliance →</span>
            </Link>
          )}

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

          {expiryFlags.length > 0 && (
            <Link
              to="/inventory"
              className={`block rounded-xl border p-4 ${
                expiredCount > 0 ? "border-red-800 bg-red-950/40" : "border-amber-800 bg-amber-950/25"
              }`}
            >
              <h2 className={`text-sm font-medium ${expiredCount > 0 ? "text-red-200" : "text-amber-200"}`}>
                {expiredCount > 0
                  ? `⚠️ ${expiredCount} expired item${expiredCount === 1 ? "" : "s"} in stock`
                  : `⏳ ${expiryFlags.length} item${expiryFlags.length === 1 ? "" : "s"} expiring soon`}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {expiredCount > 0
                  ? "Pull these before a case — don't let one reach the field."
                  : "Within 30 days. Rotate or use first."}
              </p>
              <span className="mt-1 inline-block text-sm text-sky-300">Review in inventory &rarr;</span>
            </Link>
          )}

          <Link
            to="/cases/new"
            className="block rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-sky-950/60 active:from-sky-600 active:to-sky-700"
          >
            + Add case
          </Link>

          <Link
            to="/readiness"
            className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-4 active:bg-slate-800"
          >
            <div>
              <h2 className="font-semibold text-white">Am I ready?</h2>
              <p className="text-sm text-slate-400">Every size, every case — checked against your stock</p>
            </div>
            <span className="text-2xl">🩺</span>
          </Link>

          <Link
            to="/team"
            className={`flex items-center justify-between rounded-xl border px-4 py-4 active:bg-slate-800 ${
              openTodos.length > 0
                ? "border-sky-800 bg-sky-950/30"
                : "border-slate-700 bg-slate-800/50"
            }`}
          >
            <div>
              <h2 className="font-semibold text-white">Team board</h2>
              <p className="text-sm text-slate-400">
                {openTodos.length > 0
                  ? `${openTodos.length} to-do${openTodos.length === 1 ? "" : "s"} assigned to you`
                  : newPosts > 0
                    ? `${newPosts} new post${newPosts === 1 ? "" : "s"} since your last visit`
                    : mentions.length > 0
                      ? `${mentions.length} post${mentions.length === 1 ? "" : "s"} mention you`
                      : "Notes, hand-offs & to-dos"}
              </p>
            </div>
            <span className="text-2xl">💬</span>
          </Link>

          <div className="grid grid-cols-6 gap-1.5">
            {[
              { to: "/runsheet", icon: "📋", label: "Today" },
              { to: "/tasks", icon: "☑️", label: "Tasks" },
              { to: "/notes", icon: "🗒️", label: "Notes" },
              { to: "/qa", icon: "❓", label: "Q&A" },
              { to: "/billing", icon: "💵", label: "Billing" },
              { to: "/compliance", icon: "🪪", label: "Creds" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-xl border border-slate-700 bg-slate-800/50 px-2 py-3 text-center active:bg-slate-800"
              >
                <span className="text-xl">{l.icon}</span>
                <p className="mt-1 text-xs font-medium text-slate-300">{l.label}</p>
              </Link>
            ))}
          </div>

          {lotSuggestions.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300">⏳ Use these lots first</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Expiring within 60 days, matched to an upcoming case that could use them.
              </p>
              <div className="mt-2 space-y-1">
                {lotSuggestions.slice(0, 4).map((sug) => (
                  <p key={sug.item.id} className="text-sm text-slate-300">
                    {sug.item.name}
                    {sug.item.lot_number ? ` (lot ${sug.item.lot_number})` : ""} — {sug.daysLeft}d left ·
                    fits the {formatDateShort(sug.candidateCase!.surgery_date)}
                    {sug.candidateCase!.side ? ` ${sug.candidateCase!.side === "LEFT" ? "L" : "R"}` : ""} case
                  </p>
                ))}
              </div>
            </div>
          )}

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
