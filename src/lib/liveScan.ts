import { readBarcodes } from "zxing-wasm/reader";
import { READ_OPTIONS } from "./scanning";

/**
 * A live camera scanner that decodes at the sensor's resolution.
 *
 * WHY THIS EXISTS, because the obvious answer is "html5-qrcode already does
 * this" and it does not. That library decodes the preview from a canvas sized
 * to the scan box in CSS pixels and draws each frame down into it, so on a
 * phone the decoder receives roughly 400x300 pixels no matter what the camera
 * produces. A GS1 data-matrix on an implant box is a few millimetres across:
 * at that scale its modules land inside a single pixel and it can never
 * decode, however long you hold it there. That is not a tuning problem, and it
 * is why the scan screen showed a working-looking camera that never read an
 * implant box, while the still-photo path read them fine.
 *
 * So this takes the pipeline that was already measured to work -- zxing-cpp
 * over a full-size frame, 17 of 19 hard photos at ~193ms -- and runs it on
 * frames pulled straight off the video element at videoWidth x videoHeight.
 * That is 1920x1080 rather than 400x300: the same thirty-fold difference in
 * pixels-per-module that separates a photo that decodes from one that doesn't.
 *
 * Frames go to the decoder as ImageData, never through toBlob(): JPEG
 * encoding a 1080p frame costs more than decoding it does, and the decoder
 * takes raw pixels perfectly well.
 *
 * The loop is self-paced rather than on a timer. A decode takes about as long
 * as several frames do to arrive, so a fixed interval would queue work faster
 * than it completes and the preview would stutter while the backlog grew.
 * Each pass starts when the last one finished.
 */

export interface LiveScanHandle {
  /** Stops the loop and releases the camera. Safe to call more than once. */
  stop: () => void;
  /**
   * A still of what the camera is seeing right now, at full sensor resolution,
   * as a JPEG File. Never touches the photo library — this is a canvas, not a
   * capture intent — so using it does not litter the camera roll.
   */
  capture: () => Promise<File | null>;
}

/** Between decode passes; small, since a pass already costs a couple hundred ms. */
const BREATH_MS = 60;

function frameToCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  // Before the first frame arrives these are 0, and a 0x0 canvas throws.
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

/**
 * Open the back camera into `video` and decode from it until stopped.
 *
 * `onDecoded` fires with the decoded text. Repeats are the caller's problem:
 * the camera holds on a barcode for many frames, and what counts as a
 * duplicate differs between a screen that opens a sheet and one that adds a
 * row to a list.
 */
export async function startLiveScan(
  video: HTMLVideoElement,
  onDecoded: (text: string) => void,
): Promise<LiveScanHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      // Ask for more than we need: extra pixels are exactly the point here,
      // and the browser clamps to whatever the camera can actually give.
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // At the distance you hold a box from a phone, a fixed focus puts the
      // label outside the depth of field — the single biggest cause of a
      // barcode that "won't scan".
      // focusMode is not in lib.dom's MediaTrackConstraintSet, but the browsers
      // that matter here honour it — same cast the old shared config used.
      advanced: [{ focusMode: "continuous" }],
    } as unknown as MediaTrackConstraints,
    audio: false,
  });

  video.srcObject = stream;
  // Both are required on iOS or the stream opens fullscreen or not at all.
  video.playsInline = true;
  video.muted = true;
  await video.play().catch(() => {
    /* autoplay refusal still leaves the stream attached; the loop will wait */
  });

  let stopped = false;

  const loop = async () => {
    while (!stopped) {
      const canvas = frameToCanvas(video);
      if (canvas) {
        try {
          const ctx = canvas.getContext("2d")!;
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const results = await readBarcodes(image, READ_OPTIONS);
          if (stopped) return;
          if (results.length) onDecoded(results[0].text);
        } catch {
          // A single bad frame is not worth reporting — the next one is
          // milliseconds away. Only a failure to open the camera is an error
          // the rep can act on, and that already threw above.
        }
      }
      await new Promise((r) => setTimeout(r, BREATH_MS));
    }
  };
  void loop();

  return {
    stop: () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
    capture: async () => {
      const canvas = frameToCanvas(video);
      if (!canvas) return null;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95),
      );
      if (!blob) return null;
      return new File([blob], `label-${Date.now()}.jpg`, { type: "image/jpeg" });
    },
  };
}
