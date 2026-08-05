import { useEffect, useRef, useState } from "react";
import { Check, Image, ImageUp, ScanLine, Trash2, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { ocrPage } from "../lib/ocr";
import { parseGs1 } from "../lib/labelParse";
import { CAMERA_CONFIG, SCANNER_CONFIG } from "../lib/scanning";
import {
  inferCategory,
  inferJoint,
  inferSide,
  inferSizeLabel,
  matchGtin,
  parsePackingSlip,
  scanScore,
} from "../lib/packingSlip";
import type { CatalogItem, CatalogJoint, CatalogSide } from "../lib/types";

const SCANNER_ID = "casetrack-slip-scanner";

/**
 * Medacta boxes carry a GS1 barcode (data-matrix or GS1-128); slips carry the
 * linear one. Naming the formats explicitly keeps the decoder from spending
 * every frame on formats that never appear on medical packaging.
 */

export interface SlipContentLine {
  catalog_item_id: string | null;
  name: string;
  category: CatalogItem["category"];
  lot_number: string | null;
  /** From a box label's hourglass date, when one was printed. */
  expiration_date: string | null;
  quantity: number;
  /** REF off the slip, so an unknown item can be added to the catalog. */
  item_number: string | null;
  /** Rep left "add to catalog" on for this unmatched REF. */
  learn: boolean;
  side: CatalogSide | null;
  joint: CatalogJoint;
  size_label: string | null;
}

interface Row {
  key: string;
  /** REF, when it came from printed text. Barcodes carry a GTIN instead. */
  itemNumber: string | null;
  gtin: string | null;
  description: string | null;
  lot: string | null;
  expiry: string | null;
  quantity: number;
  match: CatalogItem | null;
  source: "barcode" | "text";
  /**
   * Whether to add this REF to the catalog on save. Defaults on for an
   * unmatched line that has both a REF and a description -- that is a real
   * product the catalog simply has not met, and making the rep opt in one row
   * at a time is how the catalog stayed at 931 rows. Off when there is no
   * description to name it with, because "REF 02.07.10.0292" is not a name.
   */
  learn: boolean;
}

function rowName(r: Row): string {
  return (
    r.match?.name ??
    r.description ??
    (r.itemNumber ? `REF ${r.itemNumber}` : r.gtin ? `GTIN ${r.gtin}` : "Unknown item")
  );
}

/**
 * Reads the contents of a shipment off whatever the rep actually has in hand.
 *
 * There are two very different sources, and the earlier version of this screen
 * only handled one. A paper packing slip is a page of text that has to be
 * photographed and OCR'd. A box, on the other hand, has a GS1 barcode printed
 * on it that encodes the GTIN, lot and expiry exactly -- so pointing the camera
 * at a box should just work, with no photo, no OCR and no guessing. Reps mostly
 * have boxes.
 *
 * So the camera runs live from the moment this opens and decodes barcodes
 * continuously; text reading is the fallback, on a frame grabbed from that same
 * preview (already the right resolution for the recognizer) or on a photo for a
 * slip lying flat on a counter.
 *
 * Nothing is trusted blindly: everything read lands in an editable review list
 * with unmatched rows called out, and the rep confirms before anything saves.
 */
export default function PackingSlipScan({
  catalog,
  onClose,
  onConfirm,
}: {
  catalog: CatalogItem[];
  onClose: () => void;
  onConfirm: (lines: SlipContentLine[], shipmentNo: string | null, photo: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [shipmentNo, setShipmentNo] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept so a scan both reads the label and attaches the photo -- two separate
  // buttons for that was the single most confusing thing in this flow.
  const [photo, setPhoto] = useState<File | null>(null);

  // The decode callback is registered once with the camera, so it closes over
  // mount-time state. Mirror what it needs into refs.
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;
  const catalogRef = useRef<CatalogItem[]>([]);
  catalogRef.current = catalog;
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID, SCANNER_CONFIG);
    scannerRef.current = scanner;

    const started = scanner
      .start(
        { facingMode: "environment" },
        CAMERA_CONFIG,
        (text) => onDetected(text),
        () => {
          /* per-frame no-match noise, ignore */
        },
      )
      .then(() => setCameraLive(true))
      .catch((err: unknown) => {
        setCameraLive(false);
        setCameraError(
          err instanceof Error && /permission|denied|NotAllowed/i.test(err.message)
            ? "Camera access is blocked for this site. Take a photo instead, or allow the camera in Settings."
            : "Couldn't start the camera. Take a photo instead.",
        );
      });

    return () => {
      started.then(() => scannerRef.current?.stop().catch(() => {})).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function say(message: string) {
    setFlash(message);
    setTimeout(() => setFlash((cur) => (cur === message ? null : cur)), 1800);
  }

  function onDetected(code: string) {
    // The camera holds on a barcode for several frames; without this every box
    // would land three or four times.
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.code === code && now - last.at < 2500) return;
    lastScanRef.current = { code, at: now };

    // A bare 12-14 digit code is a plain UPC/EAN/GTIN with no application
    // identifiers. A GS1 element string is never that short -- "(01)" plus a
    // 14-digit GTIN is already 16 characters -- so there is no ambiguity, and
    // handing it to the GS1 walker would read the digits as a lot number.
    const bare = code.replace(/\s/g, "");
    const gs1 = /^\d{12,14}$/.test(bare)
      ? { gtin: bare, lot: null, expiration: null }
      : parseGs1(code);

    if (!gs1 || (!gs1.gtin && !gs1.lot)) {
      say("That barcode isn't a product code — try the one under the GTIN.");
      return;
    }

    const existing = rowsRef.current.find((r) => r.gtin === gs1.gtin && r.lot === gs1.lot);
    if (existing) {
      setRows((prev) =>
        prev.map((r) => (r.key === existing.key ? { ...r, quantity: r.quantity + 1 } : r)),
      );
      say(`+1 ${rowName(existing)} (now ${existing.quantity + 1})`);
      return;
    }

    const match = matchGtin(gs1.gtin, catalogRef.current);
    const row: Row = {
      key: crypto.randomUUID(),
      itemNumber: match?.item_number ?? null,
      gtin: gs1.gtin,
      description: null,
      lot: gs1.lot,
      expiry: gs1.expiration,
      quantity: 1,
      match,
      source: "barcode",
      // A barcode carries no description, so there is nothing to name a new
      // catalog entry with. The rep names it, then turns this on.
      learn: false,
    };
    setRows((prev) => [...prev, row]);
    say(match ? `Added ${match.name}` : "Scanned — not in the catalog, name it below");
    if (navigator.vibrate) navigator.vibrate(40);
  }

  /** Pauses barcode decoding so it isn't fighting the recognizer for the CPU. */
  function pauseScanning(paused: boolean) {
    try {
      if (paused) scannerRef.current?.pause(false);
      else scannerRef.current?.resume();
    } catch {
      // Not in a scanning state -- nothing to pause.
    }
  }

  /**
   * A frame off the live preview is around 1080p, which is both plenty for the
   * recognizer and a fraction of the work of a 12-megapixel photo.
   */
  async function grabFrame(): Promise<File | null> {
    const video = boxRef.current?.querySelector("video");
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    return blob ? new File([blob], `label-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
  }

  async function readText(source: File | null) {
    if (!source) {
      setError("Couldn't get a picture from the camera. Try the photo button.");
      return;
    }
    setPhoto((prev) => prev ?? source);
    setBusy(true);
    setError(null);
    setProgress("Reading…");
    pauseScanning(true);
    try {
      const result = await ocrPage(
        source,
        (text) => scanScore(parsePackingSlip(text, catalogRef.current)),
        setProgress,
      );
      const scan = parsePackingSlip(result.text, catalogRef.current);
      if (scan.lines.length === 0) {
        setError(
          "Couldn't read any item numbers. Fill the frame with the REF and LOT lines, in good light — or scan the barcode instead, which is far more reliable.",
        );
        return;
      }
      setRows((prev) => [
        ...prev,
        ...scan.lines
          // A REF that text-reading found and the barcode already gave us is
          // the same box twice.
          .filter((l) => !prev.some((r) => r.itemNumber === l.itemNumber && r.lot === l.lot))
          .map((l) => ({
            key: crypto.randomUUID(),
            itemNumber: l.itemNumber,
            gtin: null,
            description: l.description,
            lot: l.lot,
            expiry: l.expiry,
            quantity: l.quantity,
            match: l.match,
            source: "text" as const,
            learn: !l.match && !!l.itemNumber && !!l.description,
          })),
      ]);
      if (scan.header.shipmentNo) setShipmentNo(scan.header.shipmentNo);
      say(`Read ${scan.lines.length} line${scan.lines.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError(
        err instanceof Error && /too long/i.test(err.message)
          ? "The text reader couldn't download — you need a better connection for that. Barcode scanning still works offline."
          : "Text reading failed. Scan the barcode instead, or add items by hand.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
      pauseScanning(false);
    }
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function confirm() {
    onConfirm(
      rows.map((r) => ({
        catalog_item_id: r.match?.id ?? null,
        // An unmatched line still gets saved -- the REF or GTIN is better than
        // nothing, and a kit missing items is worse than one with an odd name.
        name: rowName(r),
        category: r.match?.category ?? inferCategory(r.description),
        lot_number: r.lot,
        expiration_date: r.expiry,
        quantity: r.quantity,
        item_number: r.itemNumber,
        learn: r.learn && !r.match && !!r.itemNumber,
        side: inferSide(r.description),
        joint: inferJoint(r.description),
        size_label: inferSizeLabel(r.description),
      })),
      shipmentNo,
      photo,
    );
  }

  const matched = rows.filter((r) => r.match).length;
  const units = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950">
      <div
        className="flex items-center justify-between border-b border-slate-800 px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <ScanLine size={18} /> Scan boxes or slip
          </h2>
          <p className="text-xs text-slate-400">
            {rows.length === 0
              ? "Hold a box barcode in the frame"
              : `${rows.length} line${rows.length === 1 ? "" : "s"} · ${matched} in catalog${
                  shipmentNo ? ` · ${shipmentNo}` : ""
                }`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-h-0 rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-3">
        <div ref={boxRef} className="relative overflow-hidden rounded-xl bg-black">
          <div id={SCANNER_ID} />
          {!cameraLive && !cameraError && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Starting the camera…</p>
          )}
          {busy && (
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-3 py-2">
              <p className="text-center text-sm font-medium text-sky-300">
                {progress ?? "Reading…"}
              </p>
            </div>
          )}
        </div>

        {cameraLive && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Barcodes read by themselves — it gets the lot and expiry exactly right. Keep going for
            as many boxes as you have.
          </p>
        )}

        {cameraError && (
          <p className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
            {cameraError}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={async () => readText(await grabFrame())}
            disabled={busy || !cameraLive}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm font-medium text-slate-200 disabled:opacity-40"
          >
            <ScanLine size={15} /> Read the printing
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm font-medium text-slate-200 disabled:opacity-40"
          >
            {/* No `capture` attribute on the input behind this, so the phone
                offers the library alongside the camera -- a slip photographed
                at the dock gets logged that evening. */}
            <ImageUp size={15} /> Slip photo or upload
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-slate-600">
          Use these when there's no barcode — reading printed text is slower and can misread.
        </p>

        {flash && (
          <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center text-sm font-medium text-emerald-300">
            {flash}
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2">
            <p className="text-sm text-red-300">{error}</p>
            {photo && rows.length === 0 && (
              <button
                onClick={() => onConfirm([], null, photo)}
                className="mt-2 min-h-0 text-xs font-medium text-sky-300 underline"
              >
                Keep the photo and add items by hand
              </button>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              Check these before adding. Anything misread can be fixed or removed here.
            </p>
            {rows.map((r) => (
              <div
                key={r.key}
                className={`rounded-lg border p-2.5 ${
                  r.match ? "border-slate-700 bg-slate-800/50" : "border-amber-800/70 bg-amber-950/20"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {r.match ? (
                      <p className="truncate text-sm font-medium text-slate-100">{r.match.name}</p>
                    ) : (
                      <input
                        value={r.description ?? ""}
                        onChange={(e) => update(r.key, { description: e.target.value || null })}
                        placeholder="Name this item"
                        className="min-h-0 w-full rounded border border-amber-800/60 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    )}
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {r.itemNumber ?? r.gtin ?? "—"}
                      {r.expiry && <span className="ml-2 text-slate-500">Exp {r.expiry}</span>}
                    </p>
                    {!r.match &&
                      (r.itemNumber ? (
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={r.learn}
                            onChange={(e) => update(r.key, { learn: e.target.checked })}
                            className="min-h-0 h-3.5 w-3.5 shrink-0 accent-sky-500"
                          />
                          <span className={r.learn ? "text-sky-400" : undefined}>
                            {r.learn
                              ? `Add ${r.itemNumber} to the catalog`
                              : "Not in the catalog — saved as a one-off"}
                          </span>
                        </label>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-amber-400">
                          No REF read — saved as-is
                        </p>
                      ))}
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      r.source === "barcode"
                        ? "bg-emerald-950/60 text-emerald-400"
                        : "bg-slate-700/60 text-slate-400"
                    }`}
                  >
                    {r.source === "barcode" ? "Barcode" : "Text"}
                  </span>
                  <button
                    onClick={() => remove(r.key)}
                    aria-label="Remove line"
                    className="min-h-0 shrink-0 rounded p-1 text-slate-500 active:bg-slate-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] text-slate-500">Lot</label>
                  <input
                    value={r.lot ?? ""}
                    onChange={(e) => update(r.key, { lot: e.target.value || null })}
                    placeholder="—"
                    className="min-h-0 w-32 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-100"
                  />
                  <label className="ml-auto text-[11px] text-slate-500">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) =>
                      update(r.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="min-h-0 w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 && !cameraError && !busy && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
            <Image size={15} className="shrink-0 text-slate-600" />
            <p className="text-xs text-slate-500">
              Nothing scanned yet. The barcode is usually below the GTIN number on the box.
            </p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (file) readText(file);
          }}
        />
      </div>

      {rows.length > 0 && (
        <div
          className="border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-xl"
          style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
        >
          <button
            onClick={confirm}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 py-3.5 text-lg font-semibold text-white shadow-lg shadow-sky-600/20"
          >
            <Check size={18} />
            Add {units} item{units === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
