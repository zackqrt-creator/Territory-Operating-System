import { useEffect, useState } from "react";
import {
  listRecentMovements,
  listInventory,
  listFacilities,
  listProfiles,
  listCasesByIds,
} from "../lib/api";
import type { CaseRow, Facility, InventoryItem, Movement, Profile } from "../lib/types";
import { buildActivityFeed } from "../lib/activity";
import { formatRelativeDay, formatTimeOfDay } from "../utils/dates";

export default function ActivityFeed() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listRecentMovements(100), listInventory(), listFacilities(), listProfiles()])
      .then(async ([m, i, f, p]) => {
        setMovements(m);
        setInventory(i);
        setFacilities(f);
        setProfiles(p);
        const caseIds = [...new Set(m.map((row) => row.related_case_id).filter((id): id is string => !!id))];
        setCases(await listCasesByIds(caseIds));
      })
      .finally(() => setLoading(false));
  }, []);

  const feed = buildActivityFeed(movements, inventory, facilities, profiles, cases);

  const grouped = new Map<string, typeof feed>();
  for (const entry of feed) {
    const day = formatRelativeDay(entry.createdAt);
    const list = grouped.get(day) ?? [];
    list.push(entry);
    grouped.set(day, list);
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-xl font-semibold text-white">Activity</h1>
      <p className="mt-1 text-sm text-slate-400">Everything the team has done to inventory, newest first.</p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : feed.length === 0 ? (
        <p className="mt-8 text-slate-400">No activity yet. Moves, case logs, and extensions will show up here.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {[...grouped.entries()].map(([day, entries]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-medium text-slate-400">{day}</h2>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <span className="text-lg leading-none">{entry.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-200">{entry.text}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatTimeOfDay(entry.createdAt)}</p>
                    </div>
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
