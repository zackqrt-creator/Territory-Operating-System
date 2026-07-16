import type { CatalogItem } from "./types";

/**
 * Turns the raw OCR text of a Medacta implant label into a structured
 * suggestion for the Add-Item form. NOTHING here is auto-saved — the caller
 * pre-fills the form and the rep confirms.
 *
 * The trustworthy path: the printed REF (e.g. 02.12.KA13R / 02.12.E0314FL)
 * encodes the exact product, and our catalog now carries those REFs as
 * item_number. So if the OCR'd REF exactly matches a catalog item, we link it
 * and take size/side/cement from the catalog (authoritative) rather than from
 * fuzzy OCR of those words. Lot and expiration come off the label text. If the
 * REF doesn't match anything, we don't guess a product — we just surface what
 * we read for the rep to confirm or create.
 */

export interface LabelScan {
  /** The REF token we read, normalized (uppercase, spaces removed). */
  refText: string | null;
  /** Exact catalog match on item_number, if any. */
  match: CatalogItem | null;
  side: "LEFT" | "RIGHT" | null;
  size: string | null;
  height: string | null;
  cement: "cemented" | "cementless" | null;
  lot: string | null;
  expiration: string | null; // YYYY-MM-DD
  /** Human list of which fields we actually pulled, for the "verify" note. */
  fieldsRead: string[];
}

function normalizeRef(raw: string): string {
  // OCR sometimes reads leading 0 as O and adds spaces around dots.
  return raw.toUpperCase().replace(/\s+/g, "").replace(/O/g, "0");
}

export function parseLabelText(text: string, catalog: CatalogItem[]): LabelScan {
  const upper = text.toUpperCase();
  const fieldsRead: string[] = [];

  // REF: two number groups then an alphanumeric tail, e.g. 02.12.KA13R.
  // Tolerant of OCR spaces/O-for-0 around the code.
  const refMatch = upper.match(/([0O]?\d\.\s?\d{2}\.\s?[A-Z0-9]{3,})/);
  const refText = refMatch ? normalizeRef(refMatch[1]) : null;
  if (refText) fieldsRead.push("item number");

  let match: CatalogItem | null = null;
  if (refText) {
    match =
      catalog.find((c) => c.item_number && normalizeRef(c.item_number) === refText) ?? null;
  }

  // SIDE
  let side: "LEFT" | "RIGHT" | null = null;
  if (/\bSIDE\s*:?\s*LEFT\b/.test(upper) || /\bLEFT\b/.test(upper)) side = "LEFT";
  if (/\bSIDE\s*:?\s*RIGHT\b/.test(upper) || /\bRIGHT\b/.test(upper)) side = "RIGHT";
  // Prefer the explicit "SIDE X" if both bare words appear.
  const sideExplicit = upper.match(/\bSIDE\s*:?\s*(LEFT|RIGHT)\b/);
  if (sideExplicit) side = sideExplicit[1] as "LEFT" | "RIGHT";
  if (side) fieldsRead.push("side");

  // SIZE (may carry a trailing +)
  const sizeMatch = upper.match(/\bSIZE\s*:?\s*(\d\+?)/);
  const size = sizeMatch ? sizeMatch[1] : null;
  if (size) fieldsRead.push("size");

  // HEIGHT (inserts), e.g. "HEIGHT 14 mm"
  const heightMatch = upper.match(/\bHEIGHT\s*:?\s*(\d{2})\s*MM/);
  const height = heightMatch ? heightMatch[1] : null;
  if (height) fieldsRead.push("height");

  // CEMENT
  let cement: "cemented" | "cementless" | null = null;
  if (/\bCEMENTLESS\b/.test(upper)) cement = "cementless";
  else if (/\bCEMENTED\b/.test(upper)) cement = "cemented";
  if (cement) fieldsRead.push("cement");

  // LOT: the number after LOT (labels use 6-8 digit lots)
  const lotMatch = upper.match(/\bLOT\s*:?\s*#?\s*(\d{5,})/);
  const lot = lotMatch ? lotMatch[1] : null;
  if (lot) fieldsRead.push("lot");

  // Expiration: a 20xx-mm-dd date (the hourglass line on the label)
  const expMatch = text.match(/\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
  const expiration = expMatch ? `${expMatch[1]}-${expMatch[2]}-${expMatch[3]}` : null;
  if (expiration) fieldsRead.push("expiration");

  return { refText, match, side, size, height, cement, lot, expiration, fieldsRead };
}
