import { useEffect, useRef, useState } from "react";
import { Boxes, Camera, Images } from "lucide-react";
import { findItemByBarcode, listFacilities } from "../lib/api";
import { prefillFromScan } from "../lib/labelParse";
import type { Facility, InventoryItem } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import { BatchScanSheet } from "../components/scanners";
import { cameraErrorMessage, decodePhoto } from "../lib/scanning";
import { startLiveScan, type LiveScanHandle } from "../lib/liveScan";

export default function Scan() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<InventoryItem | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [decoding, setDecoding] = useState(false);
  /**
   * The still the barcode came off, kept so the Add-item sheet can read the
   * same photo a second time for the printed words no barcode carries --
   * product, size, thickness, side, cement. Null when the code came from the
   * live camera or was typed, because there is no still to hand on.
   */
  const [scannedPhoto, setScannedPhoto] = useState<File | null>(null);
  const [cameraLive, setCameraLive] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveHandleRef = useRef<LiveScanHandle | null>(null);

  /*
   * The decode callback is registered once with the camera, so it cannot read
   * state — hence a ref. It is set the instant a code is read, not when the
   * resulting sheet opens: the loop runs several times a second and would
   * otherwise fire again during the lookup, opening a second sheet over the
   * first. Cleared when the sheets close.
   */
  const pausedRef = useRef(false);
  useEffect(() => {
    if (found === null && unknownBarcode === null && !decoding) pausedRef.current = false;
  }, [found, unknownBarcode, decoding]);

  useEffect(() => {
    listFacilities().then(setFacilities);
  }, []);

  /*
   * The live camera, decoding full-resolution frames through zxing-cpp.
   *
   * Batch mode owns its own camera full-screen — stop this one while it is
   * open rather than running two scanners against one device.
   *
   * A decode here keeps the frame it decoded from, so the Add-item sheet can
   * read the printed words off the very same image. That is what makes a live
   * scan fill in as much as a photo does: the barcode carries GTIN, lot and
   * expiry, and everything else is text sitting next to it in the frame we
   * already have.
   */
  useEffect(() => {
    if (batchMode) return;
    const video = videoRef.current;
    if (!video) return;

    let handle: LiveScanHandle | null = null;
    let cancelled = false;

    startLiveScan(video, (decodedText) => {
      if (pausedRef.current) return;
      pausedRef.current = true; // stop the loop firing again mid-lookup
      void (async () => {
        setScannedPhoto((await handle?.capture()) ?? null);
        await onDetected(decodedText);
      })();
    })
      .then((h) => {
        handle = h;
        liveHandleRef.current = h;
        if (cancelled) h.stop();
        else setCameraLive(true);
      })
      .catch((err) => setError(cameraErrorMessage(err)));

    return () => {
      cancelled = true;
      setCameraLive(false);
      handle?.stop();
      liveHandleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchMode]);

  /**
   * Grab the frame the camera is showing and run it as a still.
   *
   * This replaces the old "take a photo" file input, which handed the job to
   * the system camera and left the shot behind in the photo library. A canvas
   * grab off the existing preview never involves the photo library at all, so
   * a day of receiving no longer fills the camera roll with pictures of boxes.
   */
  async function onCapture() {
    const file = await liveHandleRef.current?.capture();
    if (!file) {
      setError("The camera isn't ready yet. Give it a moment and try again.");
      return;
    }
    await onPhoto(file);
  }

  /**
   * Decode from a still photo.
   *
   * A still comes off the full sensor and goes to zxing-cpp, which reads a
   * data-matrix far better than the live path can. This is the reliable route,
   * so it is a peer of the camera here, not a hidden fallback.
   */
  async function onPhoto(file: File) {
    setError(null);
    // Hold the live loop off for the duration. It runs several times a second
    // against the same camera, so without this a capture and an ordinary live
    // read can both land and open two sheets over each other. Released by the
    // effect below once the sheets are closed and decoding has finished.
    pausedRef.current = true;
    setDecoding(true);
    setScannedPhoto(file);
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
    // One reduction, shared with the Add-item sheet: the GTIN when the code is
    // a GS1 element string, the code itself when it is a plain UPC.
    const gtin = prefillFromScan(code).barcode;

    try {
      const item = (await findItemByBarcode(gtin)) ?? (await findItemByBarcode(bare));
      if (item) setFound(item);
      // Hand the sheet the code as it was decoded, NOT the GTIN we just reduced
      // it to. The lot (AI 10) and expiry (AI 17) live in the rest of the
      // element string, so passing the GTIN threw them away before the sheet
      // ever saw them -- which is why a scan filled the barcode field and left
      // lot and expiration blank on a box that had both encoded in it. The
      // sheet does its own reduction for the barcode field.
      else setUnknownBarcode(code);
    } catch {
      // This ran unguarded, so a failed lookup rejected into nothing and the
      // screen simply did not respond -- indistinguishable from a dead scanner.
      setError(`Read ${gtin}, but couldn't reach the inventory to look it up.`);
    }
  }

  async function onManualLookup() {
    if (!manualCode.trim()) return;
    setScannedPhoto(null);
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
       * Controls above the viewfinder, deliberately: on a phone the preview is
       * tall enough that anything below it sits off the bottom of the screen,
       * and a control nobody can see is a control nobody uses.
       *
       * "Capture" grabs the frame off this preview through a canvas. It is not
       * a file input any more, so it does not open the system camera and does
       * not leave a picture of a box in the photo library — receiving a tote no
       * longer costs you thirty shots in your camera roll.
       */}
      <button
        onClick={() => void onCapture()}
        disabled={decoding || !cameraLive}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <Camera size={17} aria-hidden />
        {decoding ? "Reading label…" : cameraLive ? "Capture label" : "Starting camera…"}
      </button>
      <p className="mt-1.5 text-xs text-slate-500">
        Hold the label steady and the camera reads it on its own — no tap needed. Capture forces a
        read of the frame you are looking at. Either way one frame gives the whole box: GTIN, lot
        and expiry out of the data-matrix, and the product, size, side, thickness and cement off
        the printed words beside it. Nothing is saved to your camera roll.
      </p>

      {/*
       * The preview. object-contain, not cover, and no crop: what is decoded is
       * the whole frame at videoWidth x videoHeight, so what you see is exactly
       * what is being read. Cropping the element here would hide part of what
       * the decoder is actually looking at.
       */}
      <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="w-full" playsInline muted autoPlay />
        {cameraLive && !decoding && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-slate-200">
              Looking for a barcode…
            </span>
          </div>
        )}
      </div>

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

      {/*
       * The import route is kept, but demoted. Picking an existing photo adds
       * nothing to the photo library — it reads from it — so it is still the
       * right answer for a label somebody else photographed, or one shot
       * earlier in the day. It is no longer the primary action because
       * capturing off the preview is both faster and leaves no trace.
       */}
      <button
        onClick={() => photoRef.current?.click()}
        disabled={decoding}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 text-sm text-slate-300 disabled:opacity-50"
      >
        <Images size={15} aria-hidden />
        Use a photo I already have
      </button>

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
          prefillPhoto={scannedPhoto}
          onClose={() => {
            setUnknownBarcode(null);
            setScannedPhoto(null);
          }}
          onCreated={() => {
            setUnknownBarcode(null);
            setScannedPhoto(null);
          }}
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
