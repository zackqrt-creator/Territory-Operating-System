import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listCasesInRange,
  listCaseTemplatesWithItems,
  listFacilities,
  listInventory,
  listProfiles,
  listRepCertifications,
} from "../lib/api";
import type {
  CaseRow,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  Profile,
  RepCertification,
} from "../lib/types";
import { computeReadiness } from "../lib/readiness";
import { scoreCase, type ScoreColor } from "../lib/crm";
import { orderCasesForDay, dayLoadWarnings, repInitials, caseRepId } from "../lib/runsheet";
import ReadinessSheet from "../components/ReadinessSheet";
import { addDays, formatDateShort, formatTime, isToday, toISODate } from "../utils/dates";

const SCORE_STYLE: Record<ScoreColor, string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  yellow: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
};

export default function RunSheet() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? toISODate(new Date());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [certs, setCerts] = useState<RepCertification[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCase, setOpenCase] = useState<CaseRow | null>(null);

  function refresh() {
    setLoading(true);
    return Promise.all([
      listCasesInRange(date, date),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listInventory(),
      listRepCertifications(),
      listProfiles(),
    ])
      .then(([c, f, t, i, rc, p]) => {
        setCases(c);
        setFacilities(f);
        setTemplates(t);
        setInventory(i);
        setCerts(rc);
        setProfiles(p);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const ordered = useMemo(() => orderCasesForDay(cases), [cases]);
  const warnings = useMemo(() => dayLoadWarnings(cases, facilities), [cases, facilities]);

  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";
  const profileById = (id: string | null) => profiles.find((p) => p.id === id);

  function goDay(delta: number) {
    setParams({ date: addDays(date, delta) });
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Run Sheet</h1>
        <Link
          to={`/staging?date=${date}`}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-sky-400"
        >
          Staging →
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => goDay(-1)} className="px-2 py-1 text-xl text-slate-400">
          ‹
        </button>
        <span className="text-sm font-medium text-slate-300">
          {isToday(date) ? "Today · " : ""}
          {formatDateShort(date)}
        </span>
        <button onClick={() => goDay(1)} className="px-2 py-1 text-xl text-slate-400">
          ›
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 space-y-1 rounded-lg border border-amber-800 bg-amber-950/30 p-3">
          {warnings.map((w) => (
            <p key={w} className="text-sm text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : ordered.length === 0 ? (
        <p className="mt-8 text-slate-400">No cases on this day.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {ordered.map((c) => {
            const readiness = computeReadiness(c, templates, inventory, facilities);
            const score = scoreCase(c, readiness, inventory, certs);
            const rep = profileById(caseRepId(c));
            return (
              <button
                key={c.id}
                onClick={() => setOpenCase(c)}
                className="flex w-full items-stretch gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-left active:bg-slate-800"
              >
                <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-slate-700 pr-3">
                  <span className="text-sm font-semibold text-white">
                    {c.time_tba || !c.surgery_time ? "TBA" : formatTime(c.surgery_time)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-white">
                      {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instrument"}
                      {c.variant === "partial" ? " · Partial" : ""}
                      {c.side ? ` · ${c.side === "LEFT" ? "L" : "R"}` : ""}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SCORE_STYLE[score.color]}`}
                    >
                      {score.color === "green" ? "● Ready" : score.color === "yellow" ? "● Check" : "● At risk"}
                    </span>
                  </div>
                  <p className="truncate text-sm text-slate-400">
                    {facilityName(c.facility_id)}
                    {c.surgeon ? ` · ${c.surgeon}` : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                      {repInitials(rep)}
                    </span>
                    {c.status === "completed" && (
                      <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">
                        Done
                      </span>
                    )}
                    {c.notes && <span className="truncate text-xs text-slate-500">{c.notes}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openCase && (
        <ReadinessSheet
          caseRow={openCase}
          templates={templates}
          inventory={inventory}
          facilities={facilities}
          onClose={() => setOpenCase(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
