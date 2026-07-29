import { useRef, useState } from "react";
import { Camera, Check, FileText, Trash2, X } from "lucide-react";
import { ocrPage } from "../lib/ocr";
import { parsePackingSlip, scanScore, type PackingSlipLine } from "../lib/packingSlip";
import type { CatalogItem } from "../lib/types";

export interface SlipContentLine {
  catalog_item_id: string | null;
  name: string;
  category: CatalogItem["category"];
  lot_number: string | null;
  quantity: number;
}

/**
 * Photograph the paper packing slip that ships inside a loaner kit and turn it
 * into the kit's contents.
 *
 * Everything here is a suggestion. OCR on a creased page shot at an angle gets
 * things wrong, so the parsed lines are shown as an editable review list with
 * unmatched rows called out -- the rep confirms before anything is saved. That
 * is still far less work than typing fifteen lines by hand.
 */
export default function PackingSlipScan({
  catalog,
  onClose,
  onConfirm,
}: {
  catalog: CatalogItem[];
  onClose: () => void;
  onConfirm: (lines: SlipContentLine[], shipmentNo: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lines, setLines] = useState<PackingSlipLine[] | null>(null);
  const [shipmentNo, setShipmentNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress("Reading the slip...");
    try {
      const result = await ocrPage(
        file,
        (text) => scanScore(parsePackingSlip(text, catalog)),
        (n, total) => setProgress(`Reading the slip... (${n}/${total})`),
      );
      const scan = parsePackingSlip(result.text, catalog);
      if (scan.lines.length === 0) {
        setError(
          "Couldn't read any item numbers. Try again with the page flat, filling the frame, in good light.",
        );
        setLines(null);
      } else {
        setLines(scan.lines);
        setShipmentNo(scan.header.shipmentNo);
      }
    } catch {
      setError("Scan failed. You can still add contents by hand.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function update(i: number, patch: Partial<PackingSlipLine>) {
    setLines((prev) => prev?.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) ?? prev);
  }

  function remove(i: number) {
    setLines((prev) => prev?.filter((_, idx) => idx !== i) ?? prev);
  }

  function confirm() {
    if (!lines) return;
    onConfirm(
      lines.map((l) => ({
        catalog_item_id: l.match?.id ?? null,
        // An unmatched line still gets saved -- the REF is better than nothing,
        // and a kit missing items is worse than a kit with an odd name.
        name: l.match?.name ?? l.description ?? `REF ${l.itemNumber}`,
        category: l.match?.category ?? "implant",
        lot_number: l.lot,
        quantity: l.quantity,
      })),
      shipmentNo,
    );
  }

  const matched = lines?.filter((l) => l.match).length ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <FileText size={18} /> Scan packing slip
          </h2>
          {lines && (
            <p className="text-xs text-slate-400">
              {lines.length} item{lines.length === 1 ? "" : "s"} · {matched} matched the catalog
              {shipmentNo && ` · ${shipmentNo}`}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-3">
        {!lines && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-300">
              Photograph the paper slip inside the kit. Lay it flat, fill the frame, and keep the
              item-number column in shot.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              The page can be sideways — each rotation is tried automatically. Reading a full page
              takes a few seconds.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              <Camera size={16} />
              {busy ? (progress ?? "Reading...") : "Take photo of slip"}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {lines && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Check these before adding. Anything OCR misread can be fixed or removed here.
            </p>
            {lines.map((l, i) => (
              <div
                key={`${l.itemNumber}-${i}`}
                className={`rounded-lg border p-2.5 ${
                  l.match ? "border-slate-700 bg-slate-800/50" : "border-amber-800/70 bg-amber-950/20"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {l.match?.name ?? l.description ?? `REF ${l.itemNumber}`}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">{l.itemNumber}</p>
                    {!l.match && (
                      <p className="mt-0.5 text-[11px] text-amber-400">Not in catalog — saved as-is</p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(i)}
                    aria-label="Remove line"
                    className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] text-slate-500">Lot</label>
                  <input
                    value={l.lot ?? ""}
                    onChange={(e) => update(i, { lot: e.target.value || null })}
                    placeholder="—"
                    className="min-h-0 w-32 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-white"
                  />
                  <label className="ml-auto text-[11px] text-slate-500">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="min-h-0 w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {lines && (
        <div className="border-t border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-lg bg-slate-800 px-3 py-3 text-sm font-medium text-slate-300 disabled:opacity-50"
            >
              Rescan
            </button>
            <button
              onClick={confirm}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 font-medium text-white"
            >
              <Check size={16} />
              Add {lines.length} item{lines.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
