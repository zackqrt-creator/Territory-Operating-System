import { useState } from "react";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { computeReadiness, gapMessage } from "../lib/readiness";
import MoveItemSheet from "./MoveItemSheet";
import { formatDateShort } from "../utils/dates";

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Consumable",
};

const STATUS_ICON: Record<string, string> = {
  ready: "✅",
  gap: "⚠️",
  missing: "❌",
};

export default function ReadinessSheet({
  caseRow,
  templates,
  inventory,
  facilities,
  onClose,
  onRefresh,
}: {
  caseRow: CaseRow;
  templates: CaseTemplateWithItems[];
  inventory: InventoryItem[];
  facilities: Facility[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [moving, setMoving] = useState<{ item: InventoryItem; target: Facility } | null>(null);

  const caseFacility = facilities.find((f) => f.id === caseRow.facility_id);
  const readiness = computeReadiness(caseRow, templates, inventory, facilities);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        <h2 className="text-lg font-semibold text-white">
          {caseRow.surgery_type === "KNEE" ? "Knee" : caseRow.surgery_type === "HIP" ? "Hip" : "Instrument"}
          {caseRow.variant === "partial" ? " · Partial" : caseRow.surgery_type !== "INSTRUMENT" ? " · Total" : ""}
          {caseRow.side ? ` · ${caseRow.side === "LEFT" ? "Left" : "Right"}` : ""}
        </h2>
        <p className="text-sm text-slate-400">
          {formatDateShort(caseRow.surgery_date)} · {caseFacility?.name ?? "No facility set"}
        </p>
        {caseRow.surgeon && <p className="text-sm text-slate-500">{caseRow.surgeon}</p>}
        {caseRow.case_id && <p className="text-xs text-slate-600">Case #{caseRow.case_id}</p>}

        <div className="mt-5">
          {!readiness.applicable ? (
            <p className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
              {caseRow.surgery_type === "INSTRUMENT"
                ? "Instrument-only case — no implant checklist applies."
                : "No case template matches this case yet, so there's no checklist to show."}
            </p>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium text-slate-300">{readiness.templateName} checklist</h3>
              <div className="space-y-2">
                {readiness.items.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      item.status === "ready"
                        ? "border-slate-700 bg-slate-800/50"
                        : "border-red-800 bg-red-950/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-medium text-white">
                          {STATUS_ICON[item.status]} {item.name}
                        </span>
                        <p className="text-xs text-slate-500">
                          {CATEGORY_LABEL[item.category]} · need {item.requiredQty}, have{" "}
                          {item.availableAtCaseFacility} here
                        </p>
                      </div>
                    </div>

                    {item.status !== "ready" && (
                      <div className="mt-2">
                        <p className="text-sm text-red-300">{gapMessage(item, caseFacility)}</p>
                        {item.status === "gap" && caseFacility && (
                          <button
                            onClick={() =>
                              setMoving({ item: item.elsewhere[0].items[0], target: caseFacility })
                            }
                            className="mt-2 rounded-lg bg-red-900/60 px-3 py-2 text-sm font-medium text-red-100 active:bg-red-900"
                          >
                            Move to {caseFacility.name}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={onClose} className="mt-5 w-full text-sm text-slate-500 underline">
          Close
        </button>
      </div>

      {moving && (
        <MoveItemSheet
          item={moving.item}
          facilities={facilities}
          initialTarget={moving.target}
          relatedCaseId={caseRow.id}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
