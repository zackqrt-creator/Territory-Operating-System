import { useMemo, useState } from "react";
import { createLoanerTote, type LoanerContentLine } from "../lib/api";
import type { CatalogItem, Facility } from "../lib/types";

interface Line extends LoanerContentLine {
  key: string;
}

function itemLabel(c: CatalogItem): string {
  const parts = [c.name];
  if (c.side && c.side !== "NA") parts.push(c.side === "LEFT" ? "L" : "R");
  if (c.size_label) parts.push(c.size_label);
  return parts.join(" · ");
}

/**
 * Loaner tote intake: outer code + inner label + itemized contents that roll
 * into per-size/side totals. "Quick fill" buttons add a full same-side set of
 * a device in one tap (matches how a loaner tote actually arrives — one of
 * every size), so a 25-piece insert tote is a couple taps, not 25 rows.
 */
export default function LoanerIntake({
  facilities,
  catalog,
  territoryId,
  defaultLocationId,
  onCreated,
  onCancel,
}: {
  facilities: Facility[];
  catalog: CatalogItem[];
  territoryId: string;
  defaultLocationId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [loanerCode, setLoanerCode] = useState("");
  const [contentsLabel, setContentsLabel] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId || facilities[0]?.id || "");
  const [returnDeadline, setReturnDeadline] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Available "sets": each (device type + side) group of sized implants, so a
  // full same-side run can be dropped in with one tap.
  const sets = useMemo(() => {
    const groups = new Map<string, { label: string; items: CatalogItem[] }>();
    for (const c of catalog) {
      if (c.category !== "implant" || !c.size_label) continue;
      const side = c.side === "LEFT" ? "Left" : c.side === "RIGHT" ? "Right" : "";
      const device = c.device_type ?? "Implant";
      const key = `${device}|${c.side}`;
      const label = `${side} ${device}`.trim();
      const g = groups.get(key) ?? { label, items: [] };
      g.items.push(c);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);

  function addItem(c: CatalogItem, qty = 1) {
    setLines((prev) => {
      const existing = prev.find((l) => l.catalog_item_id === c.id);
      if (existing) {
        return prev.map((l) => (l.catalog_item_id === c.id ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [
        ...prev,
        { key: c.id, catalog_item_id: c.id, name: c.name, category: c.category, quantity: qty },
      ];
    });
  }

  function addSet(items: CatalogItem[]) {
    for (const c of items) addItem(c, 1);
  }

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      prev.flatMap((l) => (l.key === key ? (qty <= 0 ? [] : [{ ...l, quantity: qty }]) : [l])),
    );
  }

  function onSearchPick(value: string) {
    setSearch(value);
    const match = catalog.find((c) => itemLabel(c) === value);
    if (match) {
      addItem(match, 1);
      setSearch("");
    }
  }

  async function onSubmit() {
    if (!loanerCode.trim() || !locationId || !territoryId) return;
    setSaving(true);
    try {
      await createLoanerTote({
        loanerCode: loanerCode.trim(),
        contentsLabel: contentsLabel.trim() || null,
        locationId,
        territoryId,
        returnDeadline: returnDeadline || null,
        contents: lines.map(({ catalog_item_id, name, category, quantity }) => ({
          catalog_item_id,
          name,
          category,
          quantity,
        })),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-sm text-slate-400">Loaner code (outside of the tote)</label>
        <input
          autoFocus
          value={loanerCode}
          onChange={(e) => setLoanerCode(e.target.value)}
          placeholder="SPKAEFFR08"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-medium uppercase tracking-wide text-white placeholder:text-slate-500 placeholder:normal-case"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">What's inside (plain name)</label>
        <input
          value={contentsLabel}
          onChange={(e) => setContentsLabel(e.target.value)}
          placeholder="Ins-Spherika Efficiency Right"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Return by (optional)</label>
          <input
            type="date"
            value={returnDeadline}
            onChange={(e) => setReturnDeadline(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
          />
        </div>
      </div>

      <div className="rounded-lg border border-sky-800 bg-sky-950/20 p-3">
        <p className="text-xs font-medium text-sky-200">Quick fill a full set (one of every size)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {sets.map((s) => (
            <button
              key={s.label}
              onClick={() => addSet(s.items)}
              className="rounded-full bg-sky-900/60 px-3 py-1.5 text-xs font-medium text-sky-200 active:bg-sky-800"
            >
              + {s.label} ×{s.items.length}
            </button>
          ))}
          {sets.length === 0 && (
            <p className="text-xs text-slate-500">
              No sized implants in the catalog yet — add contents by search below.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Add a single item</label>
        <input
          list="loaner-catalog"
          value={search}
          onChange={(e) => onSearchPick(e.target.value)}
          placeholder="Search catalog by size/side..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <datalist id="loaner-catalog">
          {catalog.map((c) => (
            <option key={c.id} value={itemLabel(c)} />
          ))}
        </datalist>
      </div>

      {lines.length > 0 && (
        <div className="rounded-lg border border-slate-700">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-200">
              Contents · {totalUnits} unit{totalUnits === 1 ? "" : "s"}
            </span>
            <button onClick={() => setLines([])} className="text-xs text-slate-500 underline">
              Clear
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
            {lines.map((l) => {
              const c = catalog.find((x) => x.id === l.catalog_item_id);
              return (
                <div key={l.key} className="flex items-center justify-between gap-2 rounded-md bg-slate-800/60 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {c ? itemLabel(c) : l.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(l.key, l.quantity - 1)}
                      className="h-7 w-7 rounded-md bg-slate-700 text-white"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm text-white">{l.quantity}</span>
                    <button
                      onClick={() => setQty(l.key, l.quantity + 1)}
                      className="h-7 w-7 rounded-md bg-slate-700 text-white"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={saving || !loanerCode.trim() || !locationId}
        className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-950/60 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Log loaner tote"}
      </button>
      <button onClick={onCancel} className="w-full text-sm text-slate-500 underline">
        Cancel
      </button>
    </div>
  );
}
