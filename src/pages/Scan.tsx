import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { findItemByBarcode, listFacilities } from "../lib/api";
import type { Facility, InventoryItem } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import BatchScanSheet from "../components/BatchScanSheet";

const SCANNER_ID = "casetrack-scanner";

export default function Scan() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<InventoryItem | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [batchMode, setBatchMode] = useState(false);

  // Scan callbacks are registered once with the camera; a ref (not state)
  // lets them see the latest "is a sheet open" value without restarting the camera.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = found !== null || unknownBarcode !== null;
  }, [found, unknownBarcode]);

  useEffect(() => {
    listFacilities().then(setFacilities);
  }, []);

  // Batch mode owns its own camera full-screen — stop this one while it's open
  // instead of running two scanners against the same device at once.
  useEffect(() => {
    if (batchMode) return;
    const scanner = new Html5Qrcode(SCANNER_ID);
    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (!pausedRef.current) void onDetected(decodedText);
        },
        () => {
          /* per-frame no-match noise, ignore */
        },
      )
      .catch((err) => setError(err?.message ?? "Could not start camera"));

    return () => {
      startPromise.then(() => scanner.stop().catch(() => {})).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchMode]);

  async function onDetected(code: string) {
    const item = await findItemByBarcode(code);
    if (item) setFound(item);
    else setUnknownBarcode(code);
  }

  async function onManualLookup() {
    if (!manualCode.trim()) return;
    await onDetected(manualCode.trim());
    setManualCode("");
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Scan</h1>
          <p className="mt-1 text-sm text-slate-400">
            Point the camera at a loaner kit or tray barcode/QR to check it in or out.
          </p>
        </div>
        <button
          onClick={() => setBatchMode(true)}
          className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          📦 Batch add
        </button>
      </div>

      <div id={SCANNER_ID} className="mt-4 overflow-hidden rounded-xl" />

      {error && (
        <p className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}. You can still look up an item manually below.
        </p>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-sm text-slate-400">Or enter a barcode manually</label>
        <div className="flex gap-2">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
          />
          <button
            onClick={onManualLookup}
            className="rounded-lg bg-slate-700 px-4 py-3 font-medium text-slate-100"
          >
            Look up
          </button>
        </div>
      </div>

      {found && (
        <MoveItemSheet
          item={found}
          facilities={facilities}
          onClose={() => setFound(null)}
          onMoved={() => setFound(null)}
        />
      )}

      {unknownBarcode && (
        <AddItemSheet
          facilities={facilities}
          prefillBarcode={unknownBarcode}
          onClose={() => setUnknownBarcode(null)}
          onCreated={() => setUnknownBarcode(null)}
        />
      )}

      {batchMode && (
        <BatchScanSheet
          facilities={facilities}
          onClose={() => setBatchMode(false)}
          onSaved={() => setBatchMode(false)}
        />
      )}
    </div>
  );
}
