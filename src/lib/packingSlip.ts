import type { CatalogItem } from "./types";

/**
 * Parses the paper packing slip that ships inside a Medacta loaner kit.
 *
 * The slip is far more structured than a product label -- every line carries a
 * position number, an item number (REF), a description, a lot number and a
 * shipped quantity:
 *
 *   100  02.07.1201R  GMK Tibial Tray Cemented Right S1   1.00  GMK  1 R  1
 *                     Lot No. 2412611
 *
 * That means a photo of one page can populate an entire kit's contents, which
 * is the difference between typing fifteen lines and checking fifteen lines.
 *
 * OCR is unreliable on a creased page photographed at an angle, so nothing
 * here is trusted blindly: the item number is the anchor (it has a rigid
 * shape and is matched against the real catalog), and everything parsed is
 * presented to the rep for review before it is saved.
 */

/**
 * `02.07.1201R`, `02.12.KA01R`, `02.12.T3I4R`, `02.07.12055R`.
 *
 * The dots are mandatory. Allowing them to be optional made every 7-digit lot
 * number ("2412611") and the FedEx tracking number parse as phantom items --
 * a page of fifteen real lines came back with nineteen. OCR does occasionally
 * drop a dot, but losing one line beats inventing one for every line.
 */
const ITEM_NO = /\b(\d{2})\.(\d{2})\.([A-Z0-9]{3,8})\b/gi;

/** "Lot No. 2412611", "LotNo 2412611", "Lot. 2412611". */
const LOT = /\bLot\s*\.?\s*(?:No\.?)?\s*[:\-]?\s*([0-9OIlSB]{5,12})\b/gi;

/** Header fields worth keeping so the kit can be traced back to the shipment. */
export interface PackingSlipHeader {
  shipmentNo: string | null;
  trackingNo: string | null;
  shippedOn: string | null;
}

export interface PackingSlipLine {
  /** Position number on the slip (100, 200, ...), when it could be read. */
  pos: number | null;
  /** Normalised item number, e.g. "02.07.1201R". */
  itemNumber: string;
  /** Raw OCR description text for this line, if one was found nearby. */
  description: string | null;
  lot: string | null;
  quantity: number;
  /** Catalog row this item number matched, when the catalog knows it. */
  match: CatalogItem | null;
}

export interface PackingSlipScan {
  header: PackingSlipHeader;
  lines: PackingSlipLine[];
  /** How many parsed item numbers matched the catalog — the confidence signal. */
  matchedCount: number;
}

/**
 * OCR routinely confuses these inside runs of digits. Item numbers and lot
 * numbers are numeric in their fixed positions, so the substitution is safe
 * there -- it is NOT applied to the free-text description.
 */
function digitsOnly(s: string): string {
  return s
    .replace(/[OoQ]/g, "0")
    .replace(/[IiLl|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2")
    .replace(/[^0-9]/g, "");
}

/**
 * The trailing segment mixes letters and digits by design (KA01R, T3I4R,
 * 1201R, 12055R), so only obviously-wrong glyphs are corrected and the rest
 * is left alone and upper-cased.
 */
function normaliseSuffix(s: string): string {
  return s.toUpperCase().replace(/O/g, "0").replace(/\|/g, "1");
}

function normaliseItemNumber(a: string, b: string, c: string): string {
  return `${digitsOnly(a).padStart(2, "0")}.${digitsOnly(b).padStart(2, "0")}.${normaliseSuffix(c)}`;
}

function parseHeader(text: string): PackingSlipHeader {
  const shipment = text.match(/Shipment\s*Nr\.?\s*([A-Z0-9/\-]+)/i);
  const tracking = text.match(/Tracking\s*Number:?\s*([0-9OIlSB\s]{10,})/i);
  const date = text.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);

  let shippedOn: string | null = null;
  if (date) {
    const [, mm, dd, yy] = date;
    const year = yy.length === 2 ? `20${yy}` : yy;
    shippedOn = `${year}-${mm}-${dd}`;
  }

  return {
    shipmentNo: shipment ? shipment[1].toUpperCase() : null,
    trackingNo: tracking ? digitsOnly(tracking[1]) : null,
    shippedOn,
  };
}

/**
 * Matches an OCR'd item number against the catalog. Exact first; then a
 * forgiving pass that ignores punctuation, since the dots are the glyphs OCR
 * most often drops.
 */
function findInCatalog(itemNumber: string, catalog: CatalogItem[]): CatalogItem | null {
  const exact = catalog.find((c) => c.item_number?.toUpperCase() === itemNumber);
  if (exact) return exact;

  const bare = itemNumber.replace(/[^A-Z0-9]/g, "");
  return (
    catalog.find((c) => (c.item_number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === bare) ??
    null
  );
}

/**
 * Pulls the description that belongs to an item number: the text between this
 * item number and whatever comes next (the lot, or the following item).
 */
function descriptionNear(text: string, from: number, to: number): string | null {
  const chunk = text
    .slice(from, to)
    .replace(/Lot\s*\.?\s*No\.?\s*[0-9OIlSB]+/gi, " ")
    .replace(/\b\d+\.\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Descriptions are wordy; anything shorter is table noise, not a name.
  return chunk.length >= 8 ? chunk.slice(0, 120) : null;
}

export function parsePackingSlip(text: string, catalog: CatalogItem[]): PackingSlipScan {
  const header = parseHeader(text);

  // Collect every item-number hit with its offset so descriptions and lots can
  // be attributed to the nearest preceding item.
  const hits: { itemNumber: string; index: number; end: number }[] = [];
  for (const m of text.matchAll(ITEM_NO)) {
    const itemNumber = normaliseItemNumber(m[1], m[2], m[3]);
    // A bare "1.00 2" quantity pair can look like an item number; require the
    // suffix to contain something other than pure punctuation.
    if (!/[A-Z0-9]/.test(m[3])) continue;
    hits.push({ itemNumber, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }

  const lots: { lot: string; index: number }[] = [];
  for (const m of text.matchAll(LOT)) {
    lots.push({ lot: digitsOnly(m[1]), index: m.index ?? 0 });
  }

  const lines: PackingSlipLine[] = [];
  const seen = new Set<string>();

  hits.forEach((hit, i) => {
    // The same REF can legitimately appear twice (two units, two lots), so
    // dedupe on item number + lot rather than item number alone.
    const next = hits[i + 1]?.index ?? text.length;
    const lot = lots.find((l) => l.index > hit.index && l.index < next)?.lot ?? null;

    const key = `${hit.itemNumber}|${lot ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);

    lines.push({
      pos: null,
      itemNumber: hit.itemNumber,
      description: descriptionNear(text, hit.end, next),
      lot,
      quantity: 1,
      match: findInCatalog(hit.itemNumber, catalog),
    });
  });

  return {
    header,
    lines,
    matchedCount: lines.filter((l) => l.match).length,
  };
}

/**
 * Confidence score for a single OCR pass, used to pick the best page
 * orientation. Catalog matches are worth far more than raw item-number shapes
 * because a wrong rotation still produces text -- it just produces text that
 * matches nothing real.
 */
export function scanScore(scan: PackingSlipScan): number {
  return scan.matchedCount * 10 + scan.lines.length + (scan.header.shipmentNo ? 5 : 0);
}
