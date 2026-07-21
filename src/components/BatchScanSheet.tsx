import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../hooks/useAuth";
import { createInventoryItem, linkCatalogItemGtin, listCatalogItems } from "../lib/api";
import { catalogLabel, parseGs1 } from "../lib/labelParse";
import type { CatalogItem, Facility, ItemCategory } from "../lib/types";

const SCANNER_ID = "casetrack-batch-scanner";
const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: "implant", label: "Implant" },
  { value: "consumable", label: "Consumable" },
  { value: "instrument_tray", label: "Instrument tray" },
  { value: "loaner_kit", label: "Loaner kit" },
];

interface BatchRow {
  id: string;
  gtin: string | null;
  lot: string | null;
  expiration: string | null;
  quantity: number;
  catalogItemId: string | null;
  name: string;
  category: ItemCategory;
  cementType: "cemented" | "cementless" | null;
  picking: boolean;
  pickSearch: string;
}

/**
 * Scan several boxes in a row (each a GS1 data-matrix), building a running
 * list — the standard "batch receiving" workflow instead of a form per box.
 * Each scan is parsed for GTIN/lot/expiration exactly like a single add;
 * an unrecognized GTIN asks once for the product, then remembers it (writes
 * the GTIN onto that catalog item) so the next box of the same product
 * auto-matches without asking again. Nothing saves until "Save all".
 */
export default function BatchScanSheet({
  facilities,
  onClose,
  onSaved,
}: {
  facilities: Facility[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [locationId, setLocationId] = useState(profile?.last_facility_id ?? facilities[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useRef<BatchRow[]>([]);
  rowsRef.current = rows;
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    listCatalogItems().then(setCatalog);
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID);
    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => onDetected(decodedText),
        () => {
          /* per-frame no-match noise, ignore */
        },
      )
      .catch((err) => setError(err?.message ?? "Could not start camera"));

    return () => {
      startPromise.then(() => scanner.stop().catch(() => {})).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDetected(code: string) {
    // Ignore the same code re-decoded within 2.5s — the camera holds on a
    // barcode for several frames, which would otherwise spam duplicate rows.
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.code === code && now - lastScanRef.current.at < 2500) {
      return;
    }
    lastScanRef.current = { code, at: now };

    const gs1 = parseGs1(code);
    if (!gs1) {
      setFlash("Not a recognized barcode — try again or add it manually.");
      setTimeout(() => setFlash(null), 2000);
      return;
    }

    // Same GTIN + lot already in this batch → another unit of the same box, bump quantity.
    const existing = rowsRef.current.find((r) => r.gtin === gs1.gtin && r.lot === gs1.lot);
    if (existing) {
      setRows((prev) => prev.map((r) => (r.id === existing.id ? { ...r, quantity: r.quantity + 1 } : r)));
      setFlash(`+1 ${existing.name || "item"} (now ${existing.quantity + 1})`);
      setTimeout(() => setFlash(null), 1500);
      return;
    }

    const match = gs1.gtin ? catalog.find((c) => c.gtin === gs1.gtin) : undefined;
    const row: BatchRow = {
      id: crypto.randomUUID(),
      gtin: gs1.gtin,
      lot: gs1.lot,
      expiration: gs1.expiration,
      quantity: 1,
      catalogItemId: match?.id ?? null,
      name: match?.name ?? "",
      category: match?.category ?? "implant",
      cementType: match?.cement_type === "cemented" || match?.cement_type === "cementless" ? match.cement_type : null,
      picking: !match,
      pickSearch: "",
    };
    setRows((prev) => [row, ...prev]);
    setFlash(match ? `Added ${match.name}` : "New item scanned — pick its product below");
    setTimeout(() => setFlash(null), 1500);
  }

  function updateRow(id: string, patch: Partial<BatchRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function onPickCatalog(row: BatchRow, item: CatalogItem) {
    updateRow(row.id, {
      catalogItemId: item.id,
      name: item.name,
      category: item.category,
      cementType: item.cement_type === "cemented" || item.cement_type === "cementless" ? item.cement_type : null,
      picking: false,
    });
    if (row.gtin && !item.gtin) {
      await linkCatalogItemGtin(item.id, row.gtin);
      setCatalog((prev) => prev.map((c) => (c.id === item.id ? { ...c, gtin: row.gtin } : c)));
    }
  }

  const readyRows = rows.filter((r) => r.name.trim());
  const canSave = readyRows.length > 0 && !!locationId && !saving;

  async function onSaveAll() {
    if (!canSave || !profile) return;
    setSaving(true);
    try {
      for (const row of readyRows) {
        await createInventoryItem({
          name: row.name.trim(),
          category: row.category,
          lot_number: row.lot,
          barcode_value: row.gtin,
          location_id: locationId,
          territory_id: profile.territory_id,
          catalog_item_id: row.catalogItemId,
          expiration_date: row.expiration,
          acquisition_type: "consignment",
          cement_type: row.category === "implant" ? row.cementType : null,
          quantity: row.quantity,
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3" style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}>
        <div>
          <h2 className="text-lg font-semibold text-white">Batch scan</h2>
          <p className="text-xs text-slate-500">Scan each box's barcode — save all at the end.</p>
        </div>
        <button onClick={onClose} className="min-h-0 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-3">
        <div id={SCANNER_ID} className="overflow-hidden rounded-xl" />

        {error && (
          <p className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>
        )}
        {flash && (
          <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/30 p-2.5 text-center text-sm font-medium text-emerald-300">
            {flash}
          </p>
        )}

        <div className="mt-3">
          <label className="mb-1 block text-sm text-slate-400">Drop-off location (applies to this whole batch)</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          Scanned ({rows.length}){readyRows.length !== rows.length ? ` · ${rows.length - readyRows.length} need a product` : ""}
        </p>

        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nothing scanned yet — point the camera at a box's barcode.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {rows.map((row) => {
              const filtered = row.pickSearch.trim()
                ? catalog.filter((c) => catalogLabel(c).toLowerCase().includes(row.pickSearch.toLowerCase()))
                : catalog;
              return (
                <div key={row.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {row.picking ? (
                        <p className="text-sm font-medium text-amber-400">⚠ Unrecognized — pick the product</p>
                      ) : (
                        <p className="truncate font-medium text-white">{row.name}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.lot ? `Lot ${row.lot}` : "Lot unread"}
                        {row.expiration ? ` · Exp ${row.expiration}` : ""}
                        {row.quantity > 1 ? ` · Qty ${row.quantity}` : ""}
                      </p>
                    </div>
                    <button onClick={() => removeRow(row.id)} className="min-h-0 shrink-0 text-slate-600">
                      ✕
                    </button>
                  </div>

                  {row.picking ? (
                    <div className="mt-2">
                      <input
                        autoFocus
                        value={row.pickSearch}
                        onChange={(e) => updateRow(row.id, { pickSearch: e.target.value })}
                        placeholder="Search catalog by name, side, size…"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      />
                      <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                        {filtered.slice(0, 30).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => onPickCatalog(row, c)}
                            className="block w-full truncate rounded-lg bg-slate-900/60 px-2.5 py-1.5 text-left text-sm text-slate-200 active:bg-slate-700"
                          >
                            {catalogLabel(c)}
                          </button>
                        ))}
                        {filtered.length === 0 && (
                          <p className="px-1 py-1 text-xs text-slate-600">No catalog match — type the name manually below.</p>
                        )}
                      </div>
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        placeholder="Or type a name for this item"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        {CATEGORY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateRow(row.id, { category: opt.value })}
                            className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
                              row.category === opt.value ? "bg-sky-600 text-white" : "bg-slate-900/60 text-slate-400"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => updateRow(row.id, { picking: true, pickSearch: "" })}
                      className="mt-1.5 text-xs text-sky-400 underline"
                    >
                      Change product
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <button
          onClick={onSaveAll}
          disabled={!canSave}
          className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 py-3.5 text-lg font-semibold text-white shadow-lg shadow-sky-950/40 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save all (${readyRows.length})`}
        </button>
      </div>
    </div>
  );
}
