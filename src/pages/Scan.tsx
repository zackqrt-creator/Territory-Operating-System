import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Boxes, Camera } from "lucide-react";
import { findItemByBarcode, listFacilities } from "../lib/api";
import { parseGs1 } from "../lib/labelParse";
import type { Facility, InventoryItem } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import { BatchScanSheet } from "../components/scanners";
import { CAMERA_CONFIG, SCANNER_CONFIG, cameraErrorMessage, decodePhoto } from "../lib/scanning";

const SCANNER_ID = "casetrack-scanner";

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
   * A still comes off the full sensor and goes to zxing-cpp, which reads a
   * data-matrix far better than the live path can. This is the reliable route,
   * so it is a peer of the camera here, not a hidden fallback.
   */
  async function onPhoto(file: File) {
    setError(null);
    setDecoding(true);
    try {
      const text = await decodePhoto(file);
      if (text) await onDetected(text);
      else
        setError(
          "No barcode found in that photo. Blur is what usually beats it — tap the label on screen to focus before you shoot, and keep the camera square to it.",
        );
    } catch {
      setError("Something went wrong reading that photo. Try taking it again.");
    } finally {
      setDecoding(false);
    }
  }

  /**
   * A scan yields a whole GS1 element string -- "(01)07630971260993(17)310311
   * (10)2604455" -- but inventory_items.barcode_value holds the bare GTIN,
   * which is what the intake flows write. Looking the raw string up verbatim
   * therefore missed every single time, and every scan of a box already in
   * stock came back "unknown" and offered to create a duplicate. Reduce to the
   * GTIN first, and only fall back to the raw text for rows saved before this.
   */
  async function onDetected(code: string) {
    const bare = code.replace(/\s/g, "");
    // A bare 12-14 digit code is already a plain GTIN/UPC with no application
    // identifiers; handing it to the GS1 walker reads its digits as a lot.
    const gtin = /^\d{12,14}$/.test(bare) ? bare : (parseGs1(code)?.gtin ?? null);

    try {
      const item = (gtin ? await findItemByBarcode(gtin) : null) ?? (await findItemByBarcode(bare));
      if (item) setFound(item);
      // Prefill with the GTIN so the new row is findable by the next scan.
      else setUnknownBarcode(gtin ?? bare);
    } catch {
      // This ran unguarded, so a failed lookup rejected into nothing and the
      // screen simply did not respond -- indistinguishable from a dead scanner.
      setError(`Read ${gtin ?? bare}, but couldn't reach the inventory to look it up.`);
    }
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

      {/*
       * Above the camera, deliberately.
       *
       * This was under the viewfinder, and on a phone the viewfinder is tall
       * enough that everything below it sits off the bottom of the screen --
       * so the only reliable way to read a label was the one control nobody
       * could see. It leads now because it is the path that works: a still is
       * decoded at full sensor resolution, where the live preview is decoded
       * from a canvas the size of the scan box.
       */}
      <button
        onClick={() => photoRef.current?.click()}
        disabled={decoding}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <Camera size={17} aria-hidden />
        {decoding ? "Reading photo…" : "Photo of the label"}
      </button>
      <p className="mt-1.5 text-xs text-slate-500">
        Take one now or pick an existing photo — either reads the GTIN, lot and expiry off the
        box. This is the reliable route for the small square data-matrix; the live camera below
        suits larger tray and kit barcodes.
      </p>

      {/*
       * Deliberately NOT height-capped, and do not add one.
       *
       * html5-qrcode maps the scan box onto the source frame with
       * videoHeight / videoElement.clientHeight, then drawImage()s that source
       * rectangle. That arithmetic assumes the element displays the whole
       * frame. Shrink the video with max-height and object-fit and the element
       * shows a centre crop while the ratio still divides by the shrunken
       * clientHeight, so the region actually scanned drifts away from the
       * region drawn on screen -- it aims somewhere other than where you point
       * it. Reachability of the controls is solved by putting them above this,
       * which is where they now are.
       */}
      <div id={SCANNER_ID} className="mt-4 overflow-hidden rounded-xl" />

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
          {/* The messages are whole sentences already; appending another one
              here produced "…try again.. You can still…". */}
          {error} You can still enter the code by hand below.
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
