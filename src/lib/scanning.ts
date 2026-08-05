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
 * READ THIS BEFORE TUNING THE LIVE CAMERA, because the obvious lever does not
 * work. html5-qrcode decodes the live stream from a canvas sized to the qrbox
 * in CSS pixels, not in camera pixels (html5-qrcode.js: the scan canvas is
 * created at qrRegion.width/height, and each frame is drawn down into it).
 * Requesting a 1080p stream therefore does NOT hand the decoder more pixels --
 * it only makes the downscale steeper. The size of the scan box is the real
 * resolution knob, which is why the box below is as large as the viewfinder
 * allows rather than a tidy square.
 *
 * The video constraints still earn their place: a sharper source downsamples
 * better, and `focusMode: continuous` genuinely matters, because at the
 * distance you hold a box from a phone a fixed focus puts the label outside
 * the depth of field. Neither makes the live camera reliable on a data-matrix
 * a few millimetres across.
 *
 * The path that IS reliable is a still photo. scanFileV2 decodes the image at
 * its native size -- 12 megapixels off an iPhone rather than a few hundred
 * CSS pixels -- and runs the robust decoder rather than the single-pass one.
 * Any screen offering a live scanner must also offer the photo, above the
 * fold, or it is offering the path that mostly fails and hiding the one that
 * works.
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
 * The box takes essentially the whole viewfinder. Every CSS pixel of it is a
 * pixel the decoder gets (see above), so the old 420x260 cap was throwing away
 * the only resolution that reaches the decoder at all. It is still wider than
 * tall because a GS1-128 is a long thin barcode and a square box makes you
 * back away until it fits -- at which distance the data-matrix beside it is
 * smaller again.
 */
export const CAMERA_CONFIG: Html5QrcodeCameraScanConfig = {
  fps: 10,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
    width: Math.floor(viewfinderWidth * 0.98),
    height: Math.floor(viewfinderHeight * 0.8),
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
