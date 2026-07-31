import { useEffect, useState } from "react";
import { listUpcomingCases, updateCaseBilling } from "../lib/api";
import type { BillingStatus, CaseRow } from "../lib/types";
import { formatDateShort } from "../utils/dates";

const STAGES: { value: BillingStatus; label: string; tone: string }[] = [
  { value: "none", label: "Not started", tone: "text-slate-400" },
  { value: "awaiting_po", label: "Awaiting PO", tone: "text-red-300" },
  { value: "po_received", label: "PO received", tone: "text-amber-300" },
  { value: "invoiced", label: "Invoiced", tone: "text-sky-300" },
  { value: "paid", label: "Paid", tone: "text-emerald-300" },
];

/**
 * Chase-the-money pipeline: every completed case, grouped by where its money
 * is. myOPS knows the PO/invoice fields but buries them — this page exists so
 * a finished case never quietly goes unbilled.
 */
export default function Billing() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    return listUpcomingCases().then((c) =>
      setCases(c.filter((k) => k.status === "completed")),
    );
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function advance(c: CaseRow) {
    const idx = STAGES.findIndex((s) => s.value === c.billing_status);
    const next = STAGES[Math.min(idx + 1, STAGES.length - 1)].value;
    if (next === c.billing_status) return;
    setBusyId(c.id);
    try {
      await updateCaseBilling(c.id, { billing_status: next });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const unpaid = cases.filter((c) => c.billing_status !== "paid");
  const paid = cases.filter((c) => c.billing_status === "paid");

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Chase the money</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every completed case and where its billing stands. Tap a stage to advance it — a finished
        case should never quietly go unbilled.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : cases.length === 0 ? (
        <p className="mt-8 text-slate-400">No completed cases yet.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-3">
              <p className="text-2xl font-bold text-white">{unpaid.length}</p>
              <p className="text-sm text-amber-300">not yet paid</p>
            </div>
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-3">
              <p className="text-2xl font-bold text-white">{paid.length}</p>
              <p className="text-sm text-emerald-300">paid</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {[...unpaid, ...paid].map((c) => {
              const stage = STAGES.find((s) => s.value === c.billing_status)!;
              return (
                <div key={c.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">
                      {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instr"}
                      {c.side ? ` ${c.side === "LEFT" ? "L" : "R"}` : ""} ·{" "}
                      {formatDateShort(c.surgery_date)}
                      {c.surgeon ? ` · ${c.surgeon}` : ""}
                    </span>
                    <button
                      onClick={() => advance(c)}
                      disabled={busyId === c.id || c.billing_status === "paid"}
                      className={`rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold ${stage.tone} disabled:opacity-70`}
                    >
                      {stage.label}
                      {c.billing_status !== "paid" ? " →" : ""}
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.case_id ? `Case #${c.case_id}` : "No case #"}
                    {c.purchase_order_no ? ` · PO ${c.purchase_order_no}` : " · no PO on file"}
                    {c.invoice_no ? ` · Inv ${c.invoice_no}` : ""}
                  </p>
                  {(() => {
                    if (c.billing_status === "paid" || c.billing_status === "none" || !c.billing_updated_at)
                      return null;
                    const days = Math.floor(
                      (Date.now() - new Date(c.billing_updated_at).getTime()) / 86400000,
                    );
                    if (days < 1) return null;
                    return (
                      <p
                        className={`mt-1 text-xs font-medium ${
                          days >= 14 ? "text-red-400" : days >= 7 ? "text-amber-400" : "text-slate-500"
                        }`}
                      >
                        ⏱ {days} day{days === 1 ? "" : "s"} in this stage
                        {days >= 14 ? " — chase it" : ""}
                      </p>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
