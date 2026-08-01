import { useEffect, useState } from "react";
import type {
  CaseItemPlan,
  CaseRow,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  QaAnswer,
  QaQuestion,
  RepCertification,
} from "../lib/types";
import { computeReadiness, gapMessage } from "../lib/readiness";
import {
  listCaseItemPlans,
  listQaAnswers,
  listQaQuestions,
  listRepCertifications,
} from "../lib/api";
import { scoreCase, type CheckStatus } from "../lib/crm";
import CaseCoverage from "./CaseCoverage";
import MoveItemSheet from "./MoveItemSheet";
import NotesSection from "./NotesSection";
import QuickLogSheet from "./QuickLogSheet";
import { StickerSheetCapture } from "./scanners";
import { formatDateShort } from "../utils/dates";

const CHECK_STYLE: Record<CheckStatus, { icon: string; text: string }> = {
  pass: { icon: "✅", text: "text-emerald-300" },
  warn: { icon: "⚠️", text: "text-amber-300" },
  fail: { icon: "❌", text: "text-red-300" },
  untracked: { icon: "◌", text: "text-slate-500" },
};

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
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
  const [logging, setLogging] = useState(false);
  const [scanningStickers, setScanningStickers] = useState(false);
  const [certs, setCerts] = useState<RepCertification[]>([]);
  const [plans, setPlans] = useState<CaseItemPlan[]>([]);
  const [qa, setQa] = useState<{ q: QaQuestion; answers: QaAnswer[] }[]>([]);

  useEffect(() => {
    listRepCertifications().then(setCerts).catch(() => {});
    listCaseItemPlans(caseRow.id).then(setPlans).catch(() => {});
    Promise.all([listQaQuestions(), listQaAnswers()])
      .then(([qs, ans]) => {
        const matched = qs.filter(
          (q) =>
            (q.pinned_surgeon_id && q.pinned_surgeon_id === caseRow.surgeon_id) ||
            (q.pinned_surgery_type && q.pinned_surgery_type === caseRow.surgery_type),
        );
        setQa(matched.map((q) => ({ q, answers: ans.filter((a) => a.question_id === q.id) })));
      })
      .catch(() => {});
  }, [caseRow.id, caseRow.surgeon_id, caseRow.surgery_type]);

  const caseFacility = facilities.find((f) => f.id === caseRow.facility_id);
  const readiness = computeReadiness(caseRow, templates, inventory, facilities);
  const score = scoreCase(caseRow, readiness, inventory, certs);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        <h2 className="text-lg font-semibold text-slate-100">
          {caseRow.surgery_type === "KNEE" ? "Knee" : caseRow.surgery_type === "HIP" ? "Hip" : "Instrument"}
          {caseRow.variant === "partial" ? " · Partial" : caseRow.surgery_type !== "INSTRUMENT" ? " · Total" : ""}
          {caseRow.side ? ` · ${caseRow.side === "LEFT" ? "Left" : "Right"}` : ""}
        </h2>
        <p className="text-sm text-slate-400">
          {formatDateShort(caseRow.surgery_date)} · {caseFacility?.name ?? "No facility set"}
        </p>
        {caseRow.surgeon && <p className="text-sm text-slate-500">{caseRow.surgeon}</p>}
        {caseRow.case_id && <p className="text-xs text-slate-600">Case #{caseRow.case_id}</p>}

        <div
          className={`mt-3 rounded-xl border p-3 ${
            score.color === "red"
              ? "border-red-800 bg-red-950/25"
              : score.color === "yellow"
                ? "border-amber-800 bg-amber-950/20"
                : "border-emerald-800 bg-emerald-950/20"
          }`}
        >
          <p className="text-sm font-semibold text-slate-100">
            Readiness:{" "}
            {score.color === "green" ? "Ready" : score.color === "yellow" ? "Needs attention" : "At risk"}
          </p>
          <div className="mt-2 space-y-1">
            {score.checks.map((c) => (
              <p key={c.key} className={`text-xs ${CHECK_STYLE[c.status].text}`}>
                {CHECK_STYLE[c.status].icon} {c.label} — {c.detail}
              </p>
            ))}
          </div>
        </div>

        {plans.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Planned items (preference card)
            </p>
            <div className="mt-1.5 space-y-1">
              {plans.map((p) => (
                <p key={p.id} className="text-sm text-slate-300">
                  {p.name} ×{p.quantity}
                  {p.source === "manual" && <span className="text-slate-500"> · added by rep</span>}
                </p>
              ))}
            </div>
          </div>
        )}

        <CaseCoverage caseId={caseRow.id} territoryId={caseRow.territory_id ?? null} />

        <NotesSection entityType="case" entityId={caseRow.id} />

        {caseRow.facility_id && (
          <NotesSection
            entityType="facility"
            entityId={caseRow.facility_id}
            title={`${caseFacility?.name ?? "Facility"} playbook`}
            placeholder="Dock hours, parking, door codes, who to find in SPD…"
          />
        )}

        {qa.length > 0 && (
          <div className="mt-3 rounded-xl border border-sky-900 bg-sky-950/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-300">
              Team Q&A for this case
            </p>
            <div className="mt-1.5 space-y-2">
              {qa.slice(0, 3).map(({ q, answers }) => (
                <div key={q.id}>
                  <p className="text-sm font-medium text-slate-200">Q: {q.body}</p>
                  {answers.length > 0 && (
                    <p className="text-sm text-slate-400">
                      A: {(answers.find((a) => a.accepted) ?? answers[0]).body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {caseRow.status === "completed" ? (
          <span className="mt-3 inline-block rounded bg-emerald-900 px-2 py-1 text-xs font-medium text-emerald-300">
            ✓ Logged complete
          </span>
        ) : (
          <button
            onClick={() => setLogging(true)}
            className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white active:bg-emerald-800"
          >
            Log case
          </button>
        )}
        <button
          onClick={() => setScanningStickers(true)}
          className="mt-2 w-full rounded-lg border border-sky-800 bg-sky-950/30 px-4 py-3 font-medium text-sky-300 active:bg-sky-950/60"
        >
          📸 Scan sticker sheet
        </button>

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
                        <span className="font-medium text-slate-100">
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

      {scanningStickers && (
        <StickerSheetCapture
          caseRow={caseRow}
          inventory={inventory}
          facilities={facilities}
          onClose={() => setScanningStickers(false)}
          onDone={onRefresh}
        />
      )}

      {logging && (
        <QuickLogSheet
          caseRow={caseRow}
          templates={templates}
          inventory={inventory}
          facilities={facilities}
          onClose={() => setLogging(false)}
          onLogged={() => {
            setLogging(false);
            onRefresh();
            onClose();
          }}
        />
      )}
    </div>
  );
}
