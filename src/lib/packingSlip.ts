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
 * `02.07.1201R`, `02.12.KA01R`, `02.12.T3I4R`, `02.07.12055R` -- and the
 * four-segment instrument numbers, `02.07.10.4522`, `02.12.10.0324`.
 *
 * The third segment is optional and that matters more than it looks. Without
 * it the pattern still matched a four-segment REF, just in the wrong place:
 * `02.07.10.4522` failed at offset 0 (`10` is too short for the final group)
 * and then succeeded at offset 3, yielding `07.10.4522`. Every instrument on a
 * delivery note silently lost its leading segment and matched nothing, so a
 * page of twelve real lines came back twelve-for-twelve unmatched. The catalog
 * carries 648 four-segment numbers, so this was most of a whole slip type.
 *
 * The dots are still mandatory. Allowing them to be optional made every
 * 7-digit lot number ("2412611") and the FedEx tracking number parse as
 * phantom items. OCR does occasionally drop a dot, but losing one line beats
 * inventing one for every line.
 */
const ITEM_NO = /\b(\d{2})\.(\d{2})(?:\.(\d{2}))?\.([A-Z0-9]{3,8})\b/gi;

/**
 * A shipped quantity, always printed to two decimals: `1.00`, `3.00`.
 *
 * Only ever searched for in the window after a lot number, because an item
 * number contains substrings of exactly this shape -- `02.07.10.4522` offers
 * up "02.07" to a naive scan.
 */
const QTY = /\b(\d{1,3})\.(\d{2})\b/g;

/** The position number in the left-hand column: `800`, `1700`, `2900`. */
const POS_BEFORE = /(\d{3,5})\s+$/;

/**
 * `GTIN 07630345710819` on a box label. A second way into the catalog when the
 * REF is the part OCR mangles.
 */
const GTIN = /\bGTIN\s*[:\-]?\s*([0-9OIlSB]{12,14})\b/gi;

/**
 * Expiry on a box label -- `2031-04-19`, sometimes only to the month. Slips
 * carry no dates, so this only ever fires on labels, which is where it matters:
 * an expiring lot is something Home warns about.
 */
const EXPIRY = /\b(20\d{2})[-/](0[1-9]|1[0-2])(?:[-/](0[1-9]|[12]\d|3[01]))?\b/g;

/** "Lot No. 2412611", "LotNo 2412611", "Lot. 2412611", "LOT 2605303". */
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
  /** ISO date from a box label, when one was printed. */
  expiry: string | null;
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

function normaliseItemNumber(a: string, b: string, c: string | undefined, d: string): string {
  const head = [a, b, c]
    .filter((s): s is string => s !== undefined)
    .map((s) => digitsOnly(s).padStart(2, "0"))
    .join(".");
  return `${head}.${normaliseSuffix(d)}`;
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
 * Looks a GTIN up in the catalog. Compared with leading zeros stripped because
 * a 13-digit GTIN is a 14-digit one without its leading zero, and labels print
 * whichever the packaging level uses.
 */
export function matchGtin(gtin: string | null, catalog: CatalogItem[]): CatalogItem | null {
  if (!gtin) return null;
  const g = gtin.replace(/^0+/, "");
  if (!g) return null;
  return catalog.find((c) => (c.gtin ?? "").replace(/^0+/, "") === g) ?? null;
}

/**
 * Matches an OCR'd item number against the catalog. Exact first; then a
 * forgiving pass that ignores punctuation, since the dots are the glyphs OCR
 * most often drops.
 */
function findInCatalog(
  itemNumber: string,
  gtin: string | null,
  catalog: CatalogItem[],
): CatalogItem | null {
  const exact = catalog.find((c) => c.item_number?.toUpperCase() === itemNumber);
  if (exact) return exact;

  const bare = itemNumber.replace(/[^A-Z0-9]/g, "");
  const loose = catalog.find(
    (c) => (c.item_number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === bare,
  );
  if (loose) return loose;

  // GTIN is pure digits, so it survives OCR better than a REF full of letters.
  return matchGtin(gtin, catalog);
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
  const hits: { itemNumber: string; index: number; end: number; pos: number | null }[] = [];
  for (const m of text.matchAll(ITEM_NO)) {
    // A bare "1.00 2" quantity pair can look like an item number; require the
    // suffix to contain something other than pure punctuation.
    if (!/[A-Z0-9]/.test(m[4])) continue;
    const index = m.index ?? 0;
    const posMatch = text.slice(Math.max(0, index - 12), index).match(POS_BEFORE);
    hits.push({
      itemNumber: normaliseItemNumber(m[1], m[2], m[3], m[4]),
      index,
      end: index + m[0].length,
      pos: posMatch ? parseInt(posMatch[1], 10) : null,
    });
  }

  const lots: { lot: string; index: number; end: number }[] = [];
  for (const m of text.matchAll(LOT)) {
    lots.push({
      lot: digitsOnly(m[1]),
      index: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  const qtys: { qty: number; index: number }[] = [];
  for (const m of text.matchAll(QTY)) {
    qtys.push({ qty: parseInt(m[1], 10), index: m.index ?? 0 });
  }

  const gtins: { gtin: string; index: number }[] = [];
  for (const m of text.matchAll(GTIN)) {
    gtins.push({ gtin: digitsOnly(m[1]), index: m.index ?? 0 });
  }

  const expiries: { expiry: string; index: number }[] = [];
  for (const m of text.matchAll(EXPIRY)) {
    // Undated months mean "end of month" in device labelling; day 01 is close
    // enough and never overstates remaining shelf life.
    expiries.push({ expiry: `${m[1]}-${m[2]}-${m[3] ?? "01"}`, index: m.index ?? 0 });
  }

  const lines: PackingSlipLine[] = [];
  const seen = new Set<string>();

  hits.forEach((hit, i) => {
    const next = hits[i + 1]?.index ?? text.length;

    // A box label prints its GTIN above the REF, so look either side of the
    // item rather than only after it.
    const gtin =
      gtins.find((g) => g.index > hit.index && g.index < next)?.gtin ??
      (hits.length === 1 ? (gtins[0]?.gtin ?? null) : null);
    const match = findInCatalog(hit.itemNumber, gtin, catalog);

    // One item can ship as several lots, each with its own count:
    //
    //   2300  02.07.10.4528  Fixed Trial baseplate # 4L        3
    //                        Lot No. 2575123        2.00
    //                        Lot No. 2577638        1.00
    //
    // Reading only the first lot lost both the second lot number and two of
    // the three units. Lots are the traceability unit for an implant, so each
    // becomes its own line rather than being summed into an untraceable 3.
    const mine = lots.filter((l) => l.index > hit.index && l.index < next);
    const description = descriptionNear(text, hit.end, mine[0]?.index ?? next);

    const parts =
      mine.length === 0
        ? [{ lot: null as string | null, quantity: 1, from: hit.end, to: next }]
        : mine.map((l, j) => ({
            lot: l.lot,
            // The count sits after the lot number on the same printed line, so
            // the search window ends at the next lot -- otherwise every lot in
            // a block would claim the first quantity it could see.
            quantity:
              qtys.find((q) => q.index >= l.end && q.index < (mine[j + 1]?.index ?? next))?.qty ?? 1,
            from: l.end,
            to: mine[j + 1]?.index ?? next,
          }));

    for (const part of parts) {
      // The same REF+lot can appear twice on a re-printed page; a second lot
      // for the same REF is a real, separate line and must survive.
      const key = `${hit.itemNumber}|${part.lot ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const expiry =
        expiries.find((e) => e.index > part.from && e.index < part.to)?.expiry ??
        (hits.length === 1 ? (expiries[0]?.expiry ?? null) : null);

      lines.push({
        pos: hit.pos,
        itemNumber: hit.itemNumber,
        description,
        lot: part.lot,
        expiry,
        quantity: part.quantity,
        match,
      });
    }
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
