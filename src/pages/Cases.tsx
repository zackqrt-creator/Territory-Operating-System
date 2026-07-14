import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUpcomingCases, listFacilities } from "../lib/api";
import type { CaseRow, Facility } from "../lib/types";
import { formatDateShort } from "../utils/dates";

export default function Cases() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listUpcomingCases(), listFacilities()])
      .then(([c, f]) => {
        setCases(c);
        setFacilities(f);
      })
      .finally(() => setLoading(false));
  }, []);

  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";

  const grouped = cases.reduce<Record<string, CaseRow[]>>((acc, c) => {
    (acc[c.surgery_date] ??= []).push(c);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Cases</h1>
        <Link to="/cases/new" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white">
          + Add
        </Link>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : dates.length === 0 ? (
        <p className="mt-8 text-slate-400">No cases yet. Tap + Add to create one.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {dates.map((date) => (
            <div key={date}>
              <h2 className="mb-2 text-sm font-medium text-slate-400">{formatDateShort(date)}</h2>
              <div className="space-y-2">
                {grouped[date].map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">
                        {c.surgery_type === "KNEE" ? "Knee" : "Instrument"}
                        {c.side ? ` · ${c.side === "LEFT" ? "L" : "R"}` : ""}
                      </span>
                      {c.status === "completed" && (
                        <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{facilityName(c.facility_id)}</p>
                    {c.case_id && <p className="text-xs text-slate-500">Case #{c.case_id}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
