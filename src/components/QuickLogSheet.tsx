import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { logCaseUsage } from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem, ItemCategory } from "../lib/types";
import { computeReadiness } from "../lib/readiness";

const CATEGORY_LABEL: Record<string, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Consumable",
};

interface LineItem {
  category: ItemCategory;
  name: string;
  quantity: number;
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
  // Only implant/consumable items are actually consumed; loaner kits and
  // trays get returned via the move flow, not decremented here.
  const consumable = readiness.items.filter(
    (i) => i.category === "implant" || i.category === "consumable",
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(consumable.map((i) => [`${i.category}|${i.name}`, i.requiredQty])),
  );
  const [saving, setSaving] = useState(false);
  const [loggedItems, setLoggedItems] = useState<LineItem[] | null>(null);

  function setQty(key: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, qty) }));
  }

  async function submit(items: LineItem[]) {
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
      setLoggedItems(items);
    } finally {
      setSaving(false);
    }
  }

  function onSubmitUsage() {
    const items = consumable
      .map((i) => ({ category: i.category, name: i.name, quantity: quantities[`${i.category}|${i.name}`] ?? 0 }))
      .filter((i) => i.quantity > 0);
    submit(items);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        {loggedItems ? (
          <>
            <h2 className="text-lg font-semibold text-white">Case logged ✓</h2>
            {loggedItems.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Marked complete. Nothing to replenish.</p>
            ) : (
              <>
                <h3 className="mb-2 mt-4 text-sm font-medium text-slate-300">Replenish these</h3>
                <div className="space-y-2">
                  {loggedItems.map((item, i) => (
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
            <button
              onClick={onLogged}
              className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white active:bg-sky-700"
            >
              Done
            </button>
          </>
        ) : !readiness.applicable || consumable.length === 0 ? (
          <>
            <h2 className="text-lg font-semibold text-white">Log case</h2>
            <p className="mt-2 text-sm text-slate-400">
              No implant or consumable checklist for this case. Mark it complete?
            </p>
            <button
              onClick={() => submit([])}
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
            <h2 className="text-lg font-semibold text-white">Log case</h2>
            <p className="mt-1 text-sm text-slate-400">
              Tap what was used — this decrements inventory at this facility and marks the case
              complete.
            </p>

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
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      <p className="text-xs text-slate-500">{CATEGORY_LABEL[item.category]}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQty(key, qty - 1)}
                        className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-medium text-white"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-white">{qty}</span>
                      <button
                        onClick={() => setQty(key, qty + 1)}
                        className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-medium text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

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
