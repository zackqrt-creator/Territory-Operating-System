import { useNavigate } from "react-router-dom";
import { Clock, Plus, X } from "lucide-react";
import type { CaseRow, Facility, Profile } from "../lib/types";
import { caseRepId, repInitials } from "../lib/runsheet";
import { formatDateShort, formatTime, isToday } from "../utils/dates";

/** The surgical day. Earlier than 6am and later than 6pm effectively never happens. */
const FIRST_HOUR = 6;
const LAST_HOUR = 18;

const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

function hourOf(time: string | null): number | null {
  if (!time) return null;
  const h = Number(time.split(":")[0]);
  return Number.isFinite(h) ? h : null;
}

function hourLabel(h: number): string {
  return formatTime(`${String(h).padStart(2, "0")}:00`);
}

/**
 * Tap a day, get the day. Cases sit in the hour they actually start, so the
 * shape of the day is visible at a glance -- back-to-backs, the gap you could
 * fit a case into, the 6am start that means leaving at 4.
 *
 * Tapping an empty hour starts a new case already carrying that date and time,
 * which is the whole point: scheduling should be two taps, not a form.
 */
export default function DaySheet({
  date,
  cases,
  facilities,
  profiles,
  currentProfileId,
  onClose,
  onOpenCase,
}: {
  date: string;
  cases: CaseRow[];
  facilities: Facility[];
  profiles: Profile[];
  currentProfileId?: string;
  onClose: () => void;
  onOpenCase: (c: CaseRow) => void;
}) {
  const navigate = useNavigate();

  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";

  // A case with no time yet still has to be visible, or it silently vanishes
  // from the one screen meant to show the whole day.
  const untimed = cases.filter((c) => c.time_tba || !c.surgery_time);
  const timed = cases.filter((c) => !c.time_tba && c.surgery_time);

  const byHour = new Map<number, CaseRow[]>();
  for (const c of timed) {
    const h = hourOf(c.surgery_time);
    if (h === null) continue;
    // Anything outside the normal day clamps to the edges rather than disappearing.
    const slot = Math.min(Math.max(h, FIRST_HOUR), LAST_HOUR);
    byHour.set(slot, [...(byHour.get(slot) ?? []), c]);
  }

  function addAt(hour: number) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    navigate(`/cases/new?date=${date}&time=${time}`);
  }

  function CaseChip({ c }: { c: CaseRow }) {
    const mine = caseRepId(c) === currentProfileId;
    return (
      <button
        onClick={() => onOpenCase(c)}
        className={`w-full rounded-lg border p-2.5 text-left active:bg-slate-800 ${
          mine ? "border-sky-800 bg-sky-950/40" : "border-slate-700 bg-slate-800/50"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              mine ? "bg-sky-500/20 text-sky-300" : "bg-slate-700 text-slate-300"
            }`}
          >
            {repInitials(profiles.find((p) => p.id === caseRepId(c)))}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instrument"}
            {c.variant === "partial" ? " · Partial" : ""}
            {c.side ? ` · ${c.side === "LEFT" ? "L" : "R"}` : ""}
          </span>
          {c.surgery_time && !c.time_tba && (
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {formatTime(c.surgery_time)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {facilityName(c.facility_id)}
          {c.surgeon ? ` · ${c.surgeon}` : ""}
        </p>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {formatDateShort(date)}
            {isToday(date) && <span className="ml-2 text-xs font-normal text-sky-400">Today</span>}
          </h2>
          <p className="text-xs text-slate-400">
            {cases.length === 0
              ? "Nothing scheduled"
              : `${cases.length} case${cases.length === 1 ? "" : "s"}`}
            {untimed.length > 0 && ` · ${untimed.length} without a time`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {untimed.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <Clock size={13} /> Needs a time
            </p>
            <div className="space-y-2">
              {untimed.map((c) => (
                <CaseChip key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {HOURS.map((h) => {
            const slot = byHour.get(h) ?? [];
            return (
              <div key={h} className="flex gap-2">
                <span className="w-14 shrink-0 pt-2 text-right text-[11px] tabular-nums text-slate-500">
                  {hourLabel(h)}
                </span>
                <div className="min-w-0 flex-1 border-t border-slate-800/80 pb-1 pt-1">
                  {slot.length > 0 ? (
                    <div className="space-y-1.5">
                      {slot.map((c) => (
                        <CaseChip key={c.id} c={c} />
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => addAt(h)}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs text-slate-600 active:bg-slate-900"
                    >
                      <Plus size={13} />
                      Add at {hourLabel(h)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
