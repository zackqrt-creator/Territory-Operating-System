import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createTimeOff, deleteTimeOff, listProfiles, listTimeOff } from "../lib/api";
import type { Profile, TimeOff } from "../lib/types";
import { formatDateShort, toISODate } from "../utils/dates";

/**
 * Block-out days: mark yourself out (vacation, training, corporate) and the
 * whole team sees it — on the calendar day, and as a warning when someone
 * tries to schedule a case on a day you're gone. You can only add or remove
 * your own time off (enforced by RLS).
 */
export default function TimeOffSheet({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<TimeOff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [start, setStart] = useState(toISODate(new Date()));
  const [end, setEnd] = useState(toISODate(new Date()));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    return Promise.all([listTimeOff(), listProfiles()]).then(([t, p]) => {
      setEntries(t);
      setProfiles(p);
    });
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const nameOf = (id: string) =>
    id === profile?.id ? "You" : (profiles.find((p) => p.id === id)?.display_name ?? "?");
  const today = toISODate(new Date());
  const upcoming = entries.filter((e) => e.end_date >= today);

  async function onAdd() {
    if (!profile || !start || !end || end < start) return;
    setBusy(true);
    try {
      await createTimeOff({
        territory_id: profile.territory_id,
        rep_id: profile.id,
        start_date: start,
        end_date: end,
        reason: reason.trim() || null,
      });
      setReason("");
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await deleteTimeOff(id);
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-white">🏖️ Time off</h2>
        <p className="mt-1 text-sm text-slate-400">
          Mark yourself out and the team sees it here, on the calendar, and as a warning when
          scheduling a case on a day you're gone.
        </p>

        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              className="min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
            />
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional) — vacation, training..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={onAdd}
            disabled={busy || !start || !end || end < start}
            className="mt-2 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Mark me out
          </button>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Upcoming</p>
        {upcoming.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-600">Nobody has time off scheduled.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {upcoming.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {nameOf(e.rep_id)} ·{" "}
                    {e.start_date === e.end_date
                      ? formatDateShort(e.start_date)
                      : `${formatDateShort(e.start_date)} – ${formatDateShort(e.end_date)}`}
                  </p>
                  {e.reason && <p className="text-xs text-slate-500">{e.reason}</p>}
                </div>
                {e.rep_id === profile?.id && (
                  <button
                    onClick={() => onDelete(e.id)}
                    disabled={busy}
                    className="min-h-0 px-2 text-slate-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
