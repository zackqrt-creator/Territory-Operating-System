import { useEffect, useState } from "react";
import {
  listCasesInRange,
  listCaseTemplatesWithItems,
  listFacilities,
  listInventory,
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { buildLoanerReport, type LoanerStatus } from "../lib/loaners";
import MoveItemSheet from "../components/MoveItemSheet";
import ExtendSheet from "../components/ExtendSheet";
import { addDays, daysUntil, formatDateShort, toISODate } from "../utils/dates";

const URGENCY_STYLE: Record<string, string> = {
  overdue: "border-red-700 bg-red-950/50",
  urgent: "border-red-800 bg-red-950/30",
  soon: "border-amber-800 bg-amber-950/20",
  extended: "border-sky-800 bg-sky-950/20",
};

export default function LoanerReturns() {
  const today = toISODate(new Date());
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<{ item: InventoryItem; target: Facility } | null>(null);
  const [extending, setExtending] = useState<{
    item: InventoryItem;
    defaultUntil?: string;
    defaultReason?: string;
    relatedCaseId?: string;
  } | null>(null);

  function refresh() {
    setLoading(true);
    return Promise.all([
      listInventory(),
      listFacilities(),
      listCaseTemplatesWithItems(),
      listCasesInRange(today, addDays(today, 3)),
    ])
      .then(([i, f, t, c]) => {
        setInventory(i);
        setFacilities(f);
        setTemplates(t);
        setCases(c);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = loading
    ? []
    : buildLoanerReport(inventory, cases, templates, facilities, daysUntil, today);

  const unassigned = inventory.filter(
    (i) => i.category === "loaner_kit" && !i.loaner_return_deadline && !i.return_extended_until,
  );

  function dueLabel(status: LoanerStatus): string {
    if (status.extended) return `Extended, ship by ${formatDateShort(status.effectiveDeadline)}`;
    if (status.daysLeft < 0) return `Overdue — should've shipped ${-status.daysLeft}d ago`;
    if (status.daysLeft === 0) return "Ship today";
    if (status.daysLeft === 1) return "Ship by tomorrow";
    return `Ship within ${status.daysLeft}d`;
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-xl font-semibold text-white">Loaner returns</h1>
      <p className="mt-1 text-sm text-slate-400">
        48 hours back to corporate after the case it was used on, unless extended for something
        coming up. Since loaners go out overnight, shipping it on the ship-by date is what
        counts — it doesn't need to have arrived yet.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : report.length === 0 ? (
        <p className="mt-8 text-slate-400">No loaner kits currently on the clock.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {report.map((status) => (
            <LoanerCard
              key={status.item.id}
              status={status}
              facilities={facilities}
              dueLabel={dueLabel(status)}
              onShip={(item) => {
                const corporate = facilities.find((f) => f.type === "corporate");
                if (corporate) setMoving({ item, target: corporate });
              }}
              onExtend={(item, defaultUntil, defaultReason, relatedCaseId) =>
                setExtending({ item, defaultUntil, defaultReason, relatedCaseId })
              }
            />
          ))}
        </div>
      )}

      {!loading && unassigned.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-slate-300">Not yet used in a case</h2>
          <div className="space-y-2">
            {unassigned.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <p className="text-sm text-white">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {facilities.find((f) => f.id === item.location_id)?.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {moving && (
        <MoveItemSheet
          item={moving.item}
          facilities={facilities}
          initialTarget={moving.target}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            refresh();
          }}
        />
      )}

      {extending && (
        <ExtendSheet
          item={extending.item}
          defaultUntil={extending.defaultUntil}
          defaultReason={extending.defaultReason}
          relatedCaseId={extending.relatedCaseId}
          onClose={() => setExtending(null)}
          onExtended={() => {
            setExtending(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function LoanerCard({
  status,
  facilities,
  dueLabel,
  onShip,
  onExtend,
}: {
  status: LoanerStatus;
  facilities: Facility[];
  dueLabel: string;
  onShip: (item: InventoryItem) => void;
  onExtend: (item: InventoryItem, defaultUntil?: string, defaultReason?: string, relatedCaseId?: string) => void;
}) {
  const { suggestion } = status;

  return (
    <div className={`rounded-lg border p-3 ${URGENCY_STYLE[status.urgency]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{status.item.name}</p>
          <p className="text-sm text-slate-400">{status.facility.name}</p>
        </div>
        <span
          className={`shrink-0 text-sm font-medium ${
            status.urgency === "extended" ? "text-sky-300" : "text-red-300"
          }`}
        >
          {dueLabel}
        </span>
      </div>

      {status.extended && status.item.return_extension_reason && (
        <p className="mt-1 text-xs text-slate-500">{status.item.return_extension_reason}</p>
      )}

      {suggestion && (
        <div className="mt-3 rounded-lg border border-amber-700 bg-amber-950/30 p-3">
          <p className="text-sm text-amber-200">
            💡{" "}
            {suggestion.type === "swap" ? (
              <>
                {suggestion.need.label} on {formatDateShort(suggestion.need.caseRow.surgery_date)}{" "}
                needs this kit. Extend this one, and ship the spare at{" "}
                {facilities.find((f) => f.id === suggestion.alternate.location_id)?.name ??
                  "another facility"}{" "}
                back instead.
              </>
            ) : (
              <>
                {suggestion.need.label} on {formatDateShort(suggestion.need.caseRow.surgery_date)}{" "}
                needs this kit again, and there's no spare. Consider an extension instead of
                shipping it back.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() =>
                onExtend(status.item, suggestion.suggestedUntil, suggestion.suggestedReason, suggestion.need.caseRow.id)
              }
              className="rounded-lg bg-amber-900/60 px-3 py-2 text-sm font-medium text-amber-100 active:bg-amber-900"
            >
              Extend this one
            </button>
            {suggestion.type === "swap" && (
              <button
                onClick={() => onShip(suggestion.alternate)}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white active:bg-slate-600"
              >
                Ship the spare instead
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onShip(status.item)}
          className="flex-1 rounded-lg bg-sky-900/60 px-3 py-2 text-sm font-medium text-sky-100 active:bg-sky-900"
        >
          Ship to corporate
        </button>
        {!suggestion && (
          <button
            onClick={() => onExtend(status.item)}
            className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white active:bg-slate-600"
          >
            Extend
          </button>
        )}
      </div>
    </div>
  );
}
