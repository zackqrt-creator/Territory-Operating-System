import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { findItemByBarcode, listFacilities } from "../lib/api";
import type { Facility, InventoryItem } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";

const SCANNER_ID = "casetrack-scanner";

export default function Scan() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<InventoryItem | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  // Scan callbacks are registered once with the camera; a ref (not state)
  // lets them see the latest "is a sheet open" value without restarting the camera.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = found !== null || unknownBarcode !== null;
  }, [found, unknownBarcode]);

  useEffect(() => {
    listFacilities().then(setFacilities);
  }, []);

  useEffect(() => {
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
  }, []);

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
      <h1 className="text-xl font-semibold text-white">Scan</h1>
      <p className="mt-1 text-sm text-slate-400">
        Point the camera at a loaner kit or tray barcode/QR to check it in or out.
      </p>

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
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
          />
          <button
            onClick={onManualLookup}
            className="rounded-lg bg-slate-700 px-4 py-3 font-medium text-white"
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
    </div>
  );
}
