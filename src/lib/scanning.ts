import { Html5QrcodeSupportedFormats } from "html5-qrcode";
import type { Html5QrcodeCameraScanConfig, Html5QrcodeFullConfig } from "html5-qrcode";

/**
 * One camera configuration for every scanner in the app.
 *
 * This exists because the three scanners drifted. PackingSlipScan was tuned
 * against real Medacta boxes until it decoded reliably; Scan and BatchScanSheet
 * were written earlier, never got the same treatment, and shipped for months
 * showing a live preview that could not decode an implant label at all. The
 * camera looked like it was working, which is the worst possible failure --
 * there is nothing to report to support, so it reads as "the app is broken."
 *
 * The two settings that actually matter:
 *
 * 1. RESOLUTION. Without videoConstraints a browser hands back roughly
 *    640x480. A GS1 data-matrix on an implant box is a few millimetres across,
 *    so at that resolution its modules land inside a single pixel and it never
 *    decodes, no matter how long you hold the box there. 1080p is the
 *    difference between working and not.
 *
 * 2. FOCUS. At the distance you hold a box from a phone, fixed focus lands
 *    the label outside the depth of field. `focusMode: continuous` is not in
 *    the standard constraint typings but mobile browsers honour it.
 *
 * The format list is a narrowing, not an enabling: html5-qrcode already
 * defaults to every format it knows. Naming the six that appear on medical
 * packaging keeps the decoder from spending frames on UPC_E and RSS_14.
 */
export const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.ITF,
];

/** Passed to `new Html5Qrcode(id, SCANNER_CONFIG)`. */
export const SCANNER_CONFIG: Html5QrcodeFullConfig = {
  formatsToSupport: SCAN_FORMATS,
  // Uses the platform's own decoder where there is one, which is dramatically
  // better at small data-matrix codes than the JS fallback. Safari has none,
  // so iOS still runs the JS path -- which is exactly why the resolution and
  // focus constraints below are not optional there.
  useBarCodeDetectorIfSupported: true,
  verbose: false,
};

/**
 * Passed as the second argument to `scanner.start()`.
 *
 * The scan box is wide and short on purpose. A GS1-128 on a box is a long thin
 * barcode; framing it inside a 250px square means backing away until the whole
 * thing fits, and at that distance the data-matrix beside it is too small to
 * resolve. Wide box, close hold, both codes readable.
 */
export const CAMERA_CONFIG: Html5QrcodeCameraScanConfig = {
  fps: 10,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
    width: Math.floor(Math.min(viewfinderWidth * 0.92, 420)),
    height: Math.floor(Math.min(viewfinderHeight * 0.65, 260)),
  }),
  videoConstraints: {
    facingMode: "environment",
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: "continuous" }],
  } as unknown as MediaTrackConstraints,
};

/**
 * Turn a camera failure into something worth reading. "NotAllowedError" on its
 * own tells a rep standing in a corridor nothing about what to do next.
 */
export function cameraErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/permission|denied|NotAllowed/i.test(raw)) {
    return "Camera access is blocked for this site. Allow it in Settings, or take a photo instead.";
  }
  if (/NotFound|NotReadable|Overconstrained/i.test(raw)) {
    return "Couldn't open the camera. Take a photo instead.";
  }
  return raw || "Couldn't start the camera. Take a photo instead.";
}
