import { useEffect, useMemo, useRef, useState } from "react";
import { createLoanerTote, type LoanerContentLine } from "../lib/api";
import { Camera, ScanLine } from "lucide-react";
import { listToteTemplatesWithItems, uploadItemPhoto } from "../lib/api";
import PackingSlipScan, { type SlipContentLine } from "./PackingSlipScan";
import type { CatalogItem, Facility, ToteTemplateWithItems } from "../lib/types";

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
  const [scanning, setScanning] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  // The myOPS Sets already loaded into the catalog. A kit that arrives without
  // paper can still be filled in from the Set it is supposed to be.
  const [toteTemplates, setToteTemplates] = useState<ToteTemplateWithItems[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");

  useEffect(() => {
    listToteTemplatesWithItems().then(setToteTemplates).catch(() => {});
  }, []);

  /**
   * Loads a Set's official item list. This is what the Set *should* contain --
   * unlike a scanned slip, which is what was actually shipped -- so lines land
   * without lot numbers and are expected to be edited down to what is really
   * in the box.
   */
  function applyTemplate(t: ToteTemplateWithItems) {
    setLines(
      t.tote_template_items.map((ti) => ({
        key: `tpl-${ti.id}`,
        catalog_item_id: ti.catalog_item_id,
        name: ti.catalog_item?.name ?? "Item",
        category: ti.catalog_item?.category ?? "implant",
        quantity: ti.quantity_per_tote ?? 1,
        lot_number: null,
      })),
    );
    if (!contentsLabel.trim()) setContentsLabel(t.name);
    if (!loanerCode.trim() && t.code) setLoanerCode(t.code);
    setTemplateSearch("");
  }

  function onPhotoSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  /** Slip lines replace whatever is staged -- rescanning should not double up. */
  function applySlip(slipLines: SlipContentLine[], shipmentNo: string | null) {
    setLines(
      slipLines.map((l, i) => ({
        key: `slip-${i}-${l.catalog_item_id ?? l.name}`,
        catalog_item_id: l.catalog_item_id,
        name: l.name,
        category: l.category,
        quantity: l.quantity,
        lot_number: l.lot_number,
        expiration_date: l.expiration_date,
      })),
    );
    if (shipmentNo && !loanerCode.trim()) setLoanerCode(shipmentNo);
    setScanning(false);
  }

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
        photoUrl: photoFile ? await uploadItemPhoto(photoFile, territoryId) : null,
        contents: lines.map(
          ({ catalog_item_id, name, category, quantity, lot_number, expiration_date }) => ({
            catalog_item_id,
            name,
            category,
            quantity,
            // Typed by hand these would not be worth the effort, but a barcode
            // or slip hands them over for free, so they are kept when we have
            // them -- expiry is what drives the expiring-lot warnings.
            lot_number: lot_number ?? null,
            expiration_date: expiration_date ?? null,
          }),
        ),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">
        Scanning opens the camera and reads each box's barcode as you point at it —
        the lot and expiry come through exactly as printed. Photo only attaches an
        image without reading it.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-3 text-sm font-medium text-sky-300"
        >
          <ScanLine size={15} /> Scan boxes
        </button>
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm font-medium text-slate-300"
        >
          <Camera size={15} /> {photoFile ? "Retake photo" : "Photo of kit"}
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onPhotoSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {photoPreview && (
        <img
          src={photoPreview}
          alt="Kit"
          className="h-28 w-full rounded-lg border border-slate-700 object-cover"
        />
      )}

      {toteTemplates.length > 0 && (
        <div>
          <label className="mb-1 block text-sm text-slate-400">
            Or start from a Set{" "}
            <span className="text-slate-500">(what it should contain)</span>
          </label>
          <input
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            placeholder="GSKAIMPL, 500KATRL, Revision..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          {templateSearch.trim().length > 0 && (
            <div className="mt-1 max-h-44 space-y-1 overflow-y-auto">
              {toteTemplates
                .filter((t) => {
                  const q = templateSearch.trim().toLowerCase();
                  return (
                    t.name.toLowerCase().includes(q) ||
                    (t.code ?? "").toLowerCase().includes(q)
                  );
                })
                .slice(0, 12)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-2 text-left active:bg-slate-700"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-100">{t.name}</span>
                      {t.code && (
                        <span className="font-mono text-[11px] text-slate-500">{t.code}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {t.tote_template_items.length} items
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-400">Loaner code (outside of the tote)</label>
        <input
          autoFocus
          value={loanerCode}
          onChange={(e) => setLoanerCode(e.target.value)}
          placeholder="SPKAEFFR08"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-medium uppercase tracking-wide text-slate-100 placeholder:text-slate-500 placeholder:normal-case"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">What's inside (plain name)</label>
        <input
          value={contentsLabel}
          onChange={(e) => setContentsLabel(e.target.value)}
          placeholder="Ins-Spherika Efficiency Right"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
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
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
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
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
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
                      className="h-7 w-7 rounded-md bg-slate-700 text-slate-100"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm text-slate-100">{l.quantity}</span>
                    <button
                      onClick={() => setQty(l.key, l.quantity + 1)}
                      className="h-7 w-7 rounded-md bg-slate-700 text-slate-100"
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
        className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-600/25 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Log loaner tote"}
      </button>
      <button onClick={onCancel} className="w-full text-sm text-slate-500 underline">
        Cancel
      </button>
      {scanning && (
        <PackingSlipScan
          catalog={catalog}
          onClose={() => setScanning(false)}
          onConfirm={(slipLines, shipment, photo) => {
            if (photo && !photoFile) onPhotoSelected(photo);
            applySlip(slipLines, shipment);
          }}
        />
      )}
    </div>
  );
}
