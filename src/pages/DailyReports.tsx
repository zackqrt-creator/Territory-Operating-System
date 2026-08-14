import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, FileText, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { getOrCreateDailyReport, listDailyReports } from "../lib/api";
import { formatReportDate } from "../lib/dailyReport";
import { toISODate } from "../utils/dates";
import type { DailyReport, DailyReportStatus } from "../lib/types";

/**
 * The history of manager updates, newest first, with today at the top.
 *
 * This is the audit trail: what was sent, when, to whom, and how. A report that
 * has been sent keeps a frozen copy of its text, so this list is the honest
 * record of what the manager actually received rather than what the report says
 * now.
 */

const STATUS_META: Record<DailyReportStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-500/20 text-slate-300" },
  ready: { label: "Ready", cls: "bg-amber-500/15 text-amber-300" },
  sent: { label: "Sent", cls: "bg-sky-500/15 text-sky-300" },
  acknowledged: { label: "Acknowledged", cls: "bg-emerald-500/15 text-emerald-300" },
  archived: { label: "Archived", cls: "bg-slate-500/20 text-slate-400" },
};

export default function DailyReports() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDailyReports()
      .then(setReports)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load reports."))
      .finally(() => setLoading(false));
  }, []);

  // Local date, not UTC: a report is filed against the rep's own day.
  const today = toISODate(new Date());
  const todaysReport = reports.find((r) => r.report_date === today);

  async function openToday() {
    if (!profile || opening) return;
    setOpening(true);
    setError(null);
    try {
      const report = await getOrCreateDailyReport({
        territoryId: profile.territory_id,
        authorId: profile.id,
        date: today,
      });
      navigate(`/daily/${report.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open today's report.");
      setOpening(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Daily report</h1>
      <p className="mt-1 text-sm text-slate-400">
        A professional end-of-day update for your manager. Nothing leaves Territory OS until you
        send it yourself.
      </p>

      <button
        onClick={openToday}
        disabled={opening || !profile}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <FileText size={17} aria-hidden />
        {opening
          ? "Opening…"
          : todaysReport
            ? "Continue today's report"
            : "Start today's report"}
      </button>

      {error && (
        <p role="alert" className="mt-3 border-l border-red-400 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <h2 className="mt-8 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
        History
      </h2>

      {loading ? (
        <p className="mt-3 text-sm text-slate-400" aria-live="polite">
          Loading…
        </p>
      ) : reports.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No reports yet. The first one you send will be kept here, exactly as it went out.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reports.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <li key={r.id}>
                <button
                  onClick={() => navigate(`/daily/${r.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left active:bg-slate-800"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100">{formatReportDate(r.report_date)}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-400">
                      {r.summary?.trim() || "No summary yet"}
                    </p>
                    {r.sent_at && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        {r.acknowledged_at ? (
                          <CheckCircle2 size={12} className="text-emerald-400" aria-hidden />
                        ) : (
                          <Send size={12} aria-hidden />
                        )}
                        {r.acknowledged_at ? "Acknowledged" : "Sent"}
                        {r.sent_to ? ` · ${r.sent_to}` : ""}
                        {r.sent_method ? ` · ${r.sent_method}` : ""}
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                    <ChevronRight size={16} className="text-slate-500" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
