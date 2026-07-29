/**
 * On-device OCR for implant labels, using tesseract.js. Runs entirely in the
 * browser (no server, no API key, no per-scan cost, and the photo never leaves
 * the phone). Lazy-imported so the ~heavy wasm/worker only loads the first time
 * the rep actually scans a label, not on app start.
 *
 * The recognizer core + English data are fetched from a CDN on first use, so
 * the very first scan needs a connection; after that the browser caches them.
 * The caller always wraps this in try/catch — if OCR fails for any reason, the
 * photo still attaches and manual entry is unaffected.
 */
export async function ocrLabel(file: File): Promise<string> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(file, "eng");
  return data.text ?? "";
}

/** Rotates an image file by a quarter-turn multiple, returning a new blob. */
async function rotated(file: File, degrees: 0 | 90 | 180 | 270): Promise<Blob> {
  if (degrees === 0) return file;

  const bitmap = await createImageBitmap(file);
  const swap = degrees === 90 || degrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.92),
  );
}

/**
 * OCR for a full page rather than a single label.
 *
 * A packing slip gets photographed however it happens to be lying on the
 * counter, and tesseract does not recover from a sideways page on its own --
 * it returns confident nonsense. So each quarter-turn is tried and the caller
 * scores the result; the orientation that yields the most real catalog matches
 * wins. Upright is tried first and short-circuits when it clearly worked, so
 * the common case still costs a single pass.
 *
 * `onProgress` reports which attempt is running, because four passes over a
 * 4000px photo is slow enough that silence looks like a hang.
 */
export async function ocrPage(
  file: File,
  score: (text: string) => number,
  onProgress?: (attempt: number, total: number) => void,
): Promise<{ text: string; degrees: number; score: number }> {
  const Tesseract = (await import("tesseract.js")).default;
  const angles: (0 | 90 | 180 | 270)[] = [0, 90, 270, 180];

  let best = { text: "", degrees: 0, score: -1 };

  for (let i = 0; i < angles.length; i++) {
    onProgress?.(i + 1, angles.length);
    try {
      const blob = await rotated(file, angles[i]);
      const { data } = await Tesseract.recognize(blob, "eng");
      const text = data.text ?? "";
      const s = score(text);
      if (s > best.score) best = { text, degrees: angles[i], score: s };
      // A pass this good is the right way up; the remaining turns cannot beat
      // it and each one costs several seconds on a phone.
      if (s >= 50) break;
    } catch {
      // A single failed orientation should not lose the whole scan.
    }
  }

  return best;
}
