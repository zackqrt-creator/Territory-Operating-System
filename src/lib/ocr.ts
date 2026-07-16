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
