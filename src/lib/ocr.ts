/**
 * On-device OCR for implant labels and packing slips, using tesseract.js. Runs
 * entirely in the browser (no server, no API key, no per-scan cost, and the
 * photo never leaves the phone). Lazy-imported so the heavy wasm/worker only
 * loads the first time the rep actually scans something, not on app start.
 *
 * The recognizer core + English data are fetched from a CDN on first use, so
 * the very first scan needs a connection; after that the browser caches them.
 * That first fetch is tens of megabytes, which is why every entry point here
 * reports progress -- a silent spinner during it is indistinguishable from a
 * hang, and a rep standing in a hospital corridor will give up long before it
 * finishes. Callers always wrap this in try/catch: if OCR fails for any reason
 * the photo still attaches and manual entry is unaffected.
 */

/**
 * A 12-megapixel phone photo is the wrong input for tesseract. The extra pixels
 * carry no additional letter shape, but the recognizer still walks all of them,
 * and on a phone CPU one 4032x3024 pass runs for the better part of a minute --
 * times four orientations. Capping the long edge at 2000px still leaves roughly
 * 30px of cap height on a full page (comfortably inside what the recognizer
 * needs) and turns that minute into a few seconds.
 */
const MAX_EDGE = 2000;

/**
 * Sheets of small stickers are the exception: twenty implant labels on one
 * page means text a third the size of a packing slip's, and at 2000px the
 * REF codes fall below what the recognizer can resolve. Still well under a
 * raw 12-megapixel frame.
 */
export const DENSE_PAGE_EDGE = 3200;

/** Give up on the first-use download rather than spinning forever on bad signal. */
const INIT_TIMEOUT_MS = 45_000;

export type OcrProgress = (message: string) => void;

/**
 * Progress from tesseract arrives on the worker's logger, which is fixed at
 * worker-creation time -- but the worker outlives any single scan. So the
 * active scan parks its reporter here and clears it when done.
 */
let activeProgress: OcrProgress | null = null;
let activeAttempt = "";

type TesseractWorker = Awaited<ReturnType<typeof createWorkerOnce>>;
let workerPromise: Promise<TesseractWorker> | null = null;

async function createWorkerOnce() {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (!activeProgress) return;
      activeProgress(phrase(m.status ?? "", m.progress ?? 0) + activeAttempt);
    },
  });
}

/**
 * One worker for the whole session. `Tesseract.recognize()` spins up and tears
 * down a worker per call, which re-initialises the recognizer for every single
 * orientation attempt -- four times the setup cost for one photo.
 */
async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = withTimeout(createWorkerOnce(), INIT_TIMEOUT_MS).catch((err) => {
      // A failed init must not poison the next attempt.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The text reader took too long to download.")),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Turns tesseract's internal status strings into something a rep can act on. */
function phrase(status: string, progress: number): string {
  if (/core|traineddata|loading|initiali/i.test(status)) {
    return "Getting the reader ready (first scan only)…";
  }
  if (/recogniz/i.test(status)) return `Reading… ${Math.round(progress * 100)}%`;
  return "Reading…";
}

/**
 * Rotates and downscales an image into something worth handing to the
 * recognizer. Returns the original untouched if the canvas is unavailable.
 */
async function prepare(
  source: Blob,
  degrees: 0 | 90 | 180 | 270,
  maxEdge: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const swap = degrees === 90 || degrees === 270;

  const canvas = document.createElement("canvas");
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return source;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? source), "image/jpeg", 0.9));
}

async function recognise(
  source: Blob,
  degrees: 0 | 90 | 180 | 270,
  maxEdge: number,
): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(await prepare(source, degrees, maxEdge));
  return data.text ?? "";
}

/** Single label, upright. Used by the add-item flow. */
export async function ocrLabel(file: Blob, onProgress?: OcrProgress): Promise<string> {
  activeProgress = onProgress ?? null;
  activeAttempt = "";
  try {
    return await recognise(file, 0, MAX_EDGE);
  } finally {
    activeProgress = null;
  }
}

/**
 * OCR for a page or a box label, trying each quarter-turn.
 *
 * A packing slip gets photographed however it happens to be lying on the
 * counter, and tesseract does not recover from a sideways page on its own -- it
 * returns confident nonsense. So the caller scores each result and the
 * orientation yielding the most real catalog matches wins. Upright is tried
 * first and short-circuits as soon as it clearly worked, so the common case
 * still costs a single pass.
 */
export interface OcrPageOptions {
  /** Long-edge cap handed to the recognizer. See MAX_EDGE / DENSE_PAGE_EDGE. */
  maxEdge?: number;
  /**
   * Score at or above which the orientation is settled and the remaining
   * quarter-turns are skipped. Defaults to 10, which is one real catalog match
   * under the packing-slip scorer. Callers scoring on a different scale (a
   * count of stickers, say) must say what "clearly worked" means for them,
   * because paying for four passes over a dense page is expensive.
   */
  goodEnough?: number;
}

export async function ocrPage(
  source: Blob,
  score: (text: string) => number,
  onProgress?: OcrProgress,
  { maxEdge = MAX_EDGE, goodEnough = 10 }: OcrPageOptions = {},
): Promise<{ text: string; degrees: number; score: number }> {
  const angles: (0 | 90 | 180 | 270)[] = [0, 90, 270, 180];
  let best = { text: "", degrees: 0, score: -1 };
  let lastError: unknown = null;

  activeProgress = onProgress ?? null;
  try {
    for (let i = 0; i < angles.length; i++) {
      activeAttempt = i === 0 ? "" : ` (turn ${i + 1} of ${angles.length})`;
      onProgress?.(i === 0 ? "Reading…" : `Trying it sideways…${activeAttempt}`);
      try {
        const text = await recognise(source, angles[i], maxEdge);
        const s = score(text);
        if (s > best.score) best = { text, degrees: angles[i], score: s };
        // Once the score says the text is really being read, the orientation
        // is settled -- stop rather than paying for three more passes.
        if (s >= goodEnough) break;
      } catch (err) {
        // A single failed orientation should not lose the whole scan.
        lastError = err;
      }
    }
  } finally {
    activeProgress = null;
    activeAttempt = "";
  }

  // Every orientation threw -- that is a setup failure, not an unreadable
  // photo, and the two need different advice.
  if (best.score < 0 && lastError) throw lastError;
  return best;
}
