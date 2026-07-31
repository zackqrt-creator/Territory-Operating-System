import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createEntityNote, logCaseUsage, markLoanerUsed } from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem, ItemCategory } from "../lib/types";
import { computeReadiness } from "../lib/readiness";
import { addDays } from "../utils/dates";

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
};

interface LineItem {
  category: ItemCategory;
  name: string;
  quantity: number;
}

interface LoanerCandidate {
  name: string;
  item: InventoryItem;
}

export default function QuickLogSheet({
  caseRow,
  templates,
  inventory,
  facilities,
  onClose,
  onLogged,
}: {
  caseRow: CaseRow;
  templates: CaseTemplateWithItems[];
  inventory: InventoryItem[];
  facilities: Facility[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const { profile } = useAuth();
  const readiness = computeReadiness(caseRow, templates, inventory, facilities);
  const [debrief, setDebrief] = useState("");
  const [savingDebrief, setSavingDebrief] = useState(false);

  /** 30-second debrief: one optional line that pins to the case AND the
   * surgeon's profile — institutional memory a competitor rep can't touch. */
  async function finishWithDebrief() {
    const text = debrief.trim();
    if (text && profile) {
      setSavingDebrief(true);
      try {
        const body = `Debrief — ${caseRow.surgery_date}${caseRow.surgeon ? ` (${caseRow.surgeon})` : ""}: ${text}`;
        await createEntityNote({
          entity_type: "case",
          entity_id: caseRow.id,
          body: text,
          territory_id: profile.territory_id,
          author_id: profile.id,
        });
        if (caseRow.surgeon_id) {
          await createEntityNote({
            entity_type: "surgeon",
            entity_id: caseRow.surgeon_id,
            body,
            territory_id: profile.territory_id,
            author_id: profile.id,
          });
        }
      } finally {
        setSavingDebrief(false);
      }
    }
    onLogged();
  }
  // Only implant/consumable items are actually consumed; loaner kits and
  // trays get returned via the move flow, not decremented here.
  const consumable = readiness.items.filter(
    (i) => i.category === "implant" || i.category === "consumable",
  );
  // Loaner kits that are physically here and ready: offer to start the
  // 48-hour return clock. A kit that's still a "gap" isn't in hand yet, so
  // there's nothing to log for it.
  const loanerCandidates: LoanerCandidate[] = readiness.items
    .filter((i) => i.category === "loaner_kit" && i.status === "ready")
    .map((i) => {
      const item = inventory.find(
        (inv) =>
          inv.category === "loaner_kit" && inv.name === i.name && inv.location_id === caseRow.facility_id,
      );
      return item ? { name: i.name, item } : null;
    })
    .filter((c): c is LoanerCandidate => c !== null);

  const hasChecklist = consumable.length > 0 || loanerCandidates.length > 0;

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(consumable.map((i) => [`${i.category}|${i.name}`, i.requiredQty])),
  );
  const [loanersUsed, setLoanersUsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(loanerCandidates.map((c) => [c.item.id, true])),
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ replenish: LineItem[]; loanerDeadline: string | null } | null>(
    null,
  );

  function setQty(key: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, qty) }));
  }

  async function submit(items: LineItem[], loaners: LoanerCandidate[]) {
    if (!profile) return;
    setSaving(true);
    try {
      await logCaseUsage({
        caseRow,
        usedItems: items,
        inventory,
        movedBy: profile.id,
        territoryId: profile.territory_id,
      });
      for (const loaner of loaners) {
        await markLoanerUsed({
          item: loaner.item,
          caseRow,
          movedBy: profile.id,
          territoryId: profile.territory_id,
        });
      }
      const loanerDeadline = loaners.length > 0 ? addDays(caseRow.surgery_date, 2) : null;
      setResult({ replenish: items, loanerDeadline });
    } finally {
      setSaving(false);
    }
  }

  function onSubmitUsage() {
    const items = consumable
      .map((i) => ({ category: i.category, name: i.name, quantity: quantities[`${i.category}|${i.name}`] ?? 0 }))
      .filter((i) => i.quantity > 0);
    const loaners = loanerCandidates.filter((c) => loanersUsed[c.item.id]);
    submit(items, loaners);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        {result ? (
          <>
            <h2 className="text-lg font-semibold text-white">Case logged ✓</h2>
            {result.loanerDeadline && (
              <p className="mt-2 rounded-lg border border-sky-800 bg-sky-950/30 p-3 text-sm text-sky-200">
                Return clock started — ship the loaner kit back to corporate by{" "}
                <span className="font-medium">{result.loanerDeadline}</span> unless you extend it.
              </p>
            )}
            {result.replenish.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">Nothing to replenish.</p>
            ) : (
              <>
                <h3 className="mb-2 mt-4 text-sm font-medium text-slate-300">Replenish these</h3>
                <div className="space-y-2">
                  {result.replenish.map((item, i) => (
                    <div key={i} className="rounded-lg border border-amber-800 bg-amber-950/20 p-3">
                      <p className="text-sm text-white">
                        {item.quantity}x {item.name}
                      </p>
                      <p className="text-xs text-slate-500">{CATEGORY_LABEL[item.category]}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-4 rounded-xl border border-sky-800 bg-sky-950/20 p-3">
              <p className="text-sm font-semibold text-sky-200">30-second debrief</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Anything go sideways or worth remembering? Saves to this case and pins to{" "}
                {caseRow.surgeon ?? "the surgeon"}'s profile.
              </p>
              <textarea
                value={debrief}
                onChange={(e) => setDebrief(e.target.value)}
                rows={2}
                placeholder="e.g. Went up a size on the femur late — have 4+ opened early next time"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <button
              onClick={finishWithDebrief}
              disabled={savingDebrief}
              className="mt-4 w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white active:bg-sky-700 disabled:opacity-50"
            >
              {savingDebrief ? "Saving…" : debrief.trim() ? "Save debrief & done" : "Done"}
            </button>
          </>
        ) : !readiness.applicable || !hasChecklist ? (
          <>
            <h2 className="text-lg font-semibold text-slate-100">Log case</h2>
            <p className="mt-2 text-sm text-slate-400">
              No implant, consumable, or loaner checklist for this case. Mark it complete?
            </p>
            <button
              onClick={() => submit([], [])}
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Mark case complete"}
            </button>
            <button onClick={onClose} className="mt-3 w-full text-sm text-slate-500 underline">
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-100">Log case</h2>
            <p className="mt-1 text-sm text-slate-400">
              Tap what was used — this decrements inventory, starts the loaner return clock, and
              marks the case complete.
            </p>

            {loanerCandidates.length > 0 && (
              <div className="mt-4 space-y-2">
                {loanerCandidates.map((c) => (
                  <label
                    key={c.item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-100">{c.name}</p>
                      <p className="text-xs text-slate-500">Loaner kit · starts 48h return clock</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={loanersUsed[c.item.id] ?? false}
                      onChange={(e) =>
                        setLoanersUsed((prev) => ({ ...prev, [c.item.id]: e.target.checked }))
                      }
                      className="h-5 w-5"
                    />
                  </label>
                ))}
              </div>
            )}

            {consumable.length > 0 && (
              <div className="mt-4 space-y-2">
                {consumable.map((item, i) => {
                  const key = `${item.category}|${item.name}`;
                  const qty = quantities[key] ?? 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-100">{item.name}</p>
                        <p className="text-xs text-slate-500">{CATEGORY_LABEL[item.category]}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQty(key, qty - 1)}
                          className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-medium text-slate-100"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-slate-100">{qty}</span>
                        <button
                          onClick={() => setQty(key, qty + 1)}
                          className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-medium text-slate-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={onSubmitUsage}
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Log case"}
            </button>
            <button onClick={onClose} className="mt-3 w-full text-sm text-slate-500 underline">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
