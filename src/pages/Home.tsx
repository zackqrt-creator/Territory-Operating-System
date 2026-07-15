import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  listUpcomingCases,
  listInventory,
  listFacilities,
  listCaseTemplatesWithItems,
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { buildStagingReport } from "../lib/staging";
import { daysUntil, formatDateShort, tomorrow } from "../utils/dates";

export default function Home() {
  const { profile, signOut } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listUpcomingCases(), listInventory(), listFacilities(), listCaseTemplatesWithItems()])
      .then(([c, i, f, t]) => {
        setCases(c);
        setItems(i);
        setFacilities(f);
        setTemplates(t);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = cases.filter((c) => c.surgery_date >= today && c.status === "scheduled");
  const nextSevenDays = upcoming.filter((c) => daysUntil(c.surgery_date) <= 7);
  const urgentLoaners = items
    .filter((i) => i.loaner_return_deadline)
    .sort((a, b) => (a.loaner_return_deadline! < b.loaner_return_deadline! ? -1 : 1))
    .filter((i) => daysUntil(i.loaner_return_deadline!) <= 2);

  const staging = useMemo(
    () => buildStagingReport(tomorrow(), cases, templates, items, facilities, daysUntil),
    [cases, templates, items, facilities],
  );
  const haulCount = staging.routes.reduce((sum, r) => sum + r.items.length, 0);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">CaseTrack</h1>
          <p className="text-sm text-slate-400">
            {profile ? `Hi, ${profile.display_name}` : "Loading..."}
          </p>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 underline">
          Sign out
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <div className="mt-6 space-y-4">
          <Link
            to="/cases/new"
            className="block rounded-xl bg-sky-600 px-4 py-4 text-center text-lg font-medium text-white active:bg-sky-700"
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
            <div className="rounded-xl border border-red-800 bg-red-950/40 p-4">
              <h2 className="text-sm font-medium text-red-300">Loaners due back soon</h2>
              <ul className="mt-2 space-y-1">
                {urgentLoaners.map((i) => (
                  <li key={i.id} className="text-sm text-red-200">
                    {i.name} &mdash; due {formatDateShort(i.loaner_return_deadline!)}
                  </li>
                ))}
              </ul>
              <Link to="/inventory" className="mt-2 inline-block text-sm text-red-300 underline">
                Open inventory &rarr;
              </Link>
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-medium text-slate-300">Inventory tracked</h2>
            <p className="mt-1 text-3xl font-semibold text-white">{items.length}</p>
            <p className="text-sm text-slate-400">items across all locations</p>
            <Link to="/inventory" className="mt-2 inline-block text-sm text-sky-400">
              Open inventory &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
