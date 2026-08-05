import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Boxes, Camera } from "lucide-react";
import { findItemByBarcode, listFacilities } from "../lib/api";
import type { Facility, InventoryItem } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import { BatchScanSheet } from "../components/scanners";
import { CAMERA_CONFIG, SCANNER_CONFIG, cameraErrorMessage } from "../lib/scanning";

const SCANNER_ID = "casetrack-scanner";
/** A second, camera-less instance: html5-qrcode cannot decode a file on an
 *  instance that is currently driving a video stream. */
const FILE_SCANNER_ID = "casetrack-scanner-file";

export default function Scan() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<InventoryItem | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

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
    const scanner = new Html5Qrcode(SCANNER_ID, SCANNER_CONFIG);
    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        CAMERA_CONFIG,
        (decodedText) => {
          if (!pausedRef.current) void onDetected(decodedText);
        },
        () => {
          /* per-frame no-match noise, ignore */
        },
      )
      .catch((err) => setError(cameraErrorMessage(err)));

    return () => {
      startPromise.then(() => scanner.stop().catch(() => {})).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchMode]);

  /**
   * Decode from a still photo.
   *
   * The live preview is capped by whatever the browser hands the video track;
   * a photo comes off the full sensor. On a label the camera cannot hold focus
   * on -- a curved foil pouch, a box at arm's length in a dim corridor -- this
   * is the path that actually works, so it is a peer of the live camera here,
   * not a hidden fallback.
   */
  async function onPhoto(file: File) {
    setError(null);
    setDecoding(true);
    try {
      const fileScanner = new Html5Qrcode(FILE_SCANNER_ID, SCANNER_CONFIG);
      const result = await fileScanner.scanFileV2(file, false);
      await onDetected(result.decodedText);
    } catch {
      setError(
        "No barcode found in that photo. Get closer to the barcode under the GTIN, hold steady, and try again.",
      );
    } finally {
      setDecoding(false);
    }
  }

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
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 font-medium text-white"
        >
          <Boxes size={16} aria-hidden />
          <span className="text-sm">Batch add</span>
        </button>
      </div>

      <div id={SCANNER_ID} className="mt-4 overflow-hidden rounded-xl" />
      {/* Never visible: html5-qrcode needs a mounted element to attach a
          file-decode instance to. */}
      <div id={FILE_SCANNER_ID} className="hidden" />

      <button
        onClick={() => photoRef.current?.click()}
        disabled={decoding}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 font-medium text-slate-300 disabled:opacity-50"
      >
        <Camera size={16} aria-hidden />
        <span className="text-sm">{decoding ? "Reading photo…" : "Take a photo instead"}</span>
      </button>
      <p className="mt-1.5 text-xs text-slate-500">
        A photo uses the full camera resolution, so it reads small data-matrix codes the live
        preview can miss.
      </p>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) void onPhoto(file);
        }}
      />

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
