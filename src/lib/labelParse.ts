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
  /** GTIN read off the printed UDI line (GS1 AI 01), if present. */
  gtin: string | null;
  /** Catalog match — exact on item_number, else on the GTIN we read. */
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

export interface Gs1Fields {
  gtin: string | null;
  lot: string | null;
  expiration: string | null; // YYYY-MM-DD
}

/** Fixed-length GS1 Application Identifiers we care about (data length after the AI). */
const GS1_FIXED_LEN: Record<string, number> = {
  "01": 14, // GTIN
  "11": 6, // production date YYMMDD
  "15": 6, // best-before
  "17": 6, // expiration YYMMDD
};

/** YYMMDD → YYYY-MM-DD. Day "00" (GS1 "end of month") becomes the month's last day. */
function gs1Date(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return null;
  if (day === 0) day = new Date(year, month, 0).getDate(); // last day of month
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a GS1 UDI element string — the barcode on every Medacta box, and
 * the "UDI (01)…(17)…(10)…" line printed beneath it. This is the reliable
 * source of truth for lot/expiration/GTIN, since the AIs are defined by the
 * standard: (01) GTIN, (17) expiration, (10) lot/batch.
 *
 * Handles both forms:
 *  - human/OCR parenthesized:  (01)07630345716248(17)301014(10)2520862
 *  - raw scanner output:       0107630345716248 17301014 10 2520862  with
 *    optional FNC1/GS (\x1d) separators after variable-length fields.
 * Returns null if it doesn't look like a GS1 string at all.
 */
export function parseGs1(input: string): Gs1Fields | null {
  /*
   * Strip a leading AIM symbology identifier: "]" plus a letter plus a digit.
   * Decoders are free to prefix the decoded text with one, and the two that
   * appear on implant packaging are exactly the ones that do it -- "]d2" for a
   * GS1 data-matrix and "]C1" for a GS1-128. Left in place the prefix fails the
   * leading-digits test below, parseGs1 returns null, and the app tells the rep
   * "not a recognized barcode" about a barcode it read perfectly.
   */
  const raw = input.replace(/^\][A-Za-z]\d/, "");
  const out: Gs1Fields = { gtin: null, lot: null, expiration: null };
  const setAI = (ai: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    if (ai === "01") out.gtin = v.replace(/\D/g, "");
    else if (ai === "17") out.expiration = gs1Date(v.replace(/\D/g, "")) ?? out.expiration;
    else if (ai === "10") out.lot = v;
  };

  // Parenthesized form — what OCR reads off the printed UDI line.
  if (raw.includes("(")) {
    let found = false;
    for (const m of raw.matchAll(/\((\d{2,4})\)\s*([^(]*)/g)) {
      found = true;
      setAI(m[1], m[2].replace(/\s+/g, ""));
    }
    return found && (out.gtin || out.lot || out.expiration) ? out : null;
  }

  // Raw element-string form (barcode scanners). Walk AI by AI; variable-length
  // fields (like lot, AI 10) run until a GS separator or end of string.
  const GS = String.fromCharCode(29); // ASCII 29 group separator
  // Keep GS separators; strip only ordinary whitespace a scanner may inject.
  const s = raw.replace(/[ \t\r\n]+/g, "");
  if (!/^\d{2}/.test(s)) return null;
  let i = 0;
  let steps = 0;
  while (i + 2 <= s.length && steps++ < 20) {
    // Some scanners emit a separator after a fixed-length field too. Reading it
    // as the first digit of the next AI turns the rest of the code into noise,
    // so skip any run of them.
    while (s[i] === GS) i++;
    const ai = s.slice(i, i + 2);
    i += 2;
    const fixed = GS1_FIXED_LEN[ai];
    if (fixed) {
      setAI(ai, s.slice(i, i + fixed));
      i += fixed;
    } else {
      // Variable-length: consume up to the next GS separator or end.
      const gsIdx = s.indexOf(GS, i);
      const end = gsIdx === -1 ? s.length : gsIdx;
      setAI(ai, s.slice(i, end));
      i = gsIdx === -1 ? s.length : gsIdx + 1;
    }
  }
  return out.gtin || out.lot || out.expiration ? out : null;
}

/** Human-readable label for a catalog item in pickers/search — name plus side/size when set. */
export function catalogLabel(c: CatalogItem): string {
  const label = [c.name];
  if (c.side && c.side !== "NA") label.push(c.side === "LEFT" ? "Left" : "Right");
  if (c.size_label) label.push(`Size ${c.size_label}`);
  return label.join(" · ");
}

export function parseLabelText(text: string, catalog: CatalogItem[]): LabelScan {
  const upper = text.toUpperCase();
  const fieldsRead: string[] = [];

  // Most reliable source for GTIN + lot + expiration: the GS1 UDI line printed
  // under the barcode, e.g. "UDI (01)07630345716248(17)301014(10)2520862". The
  // AIs are defined by the standard — (01) GTIN, (10) lot, (17) expiration — so
  // this beats reading the boxed "LOT"/hourglass cells, which OCR reorders
  // unpredictably.
  const gs1 = parseGs1(text);
  const gtin = gs1?.gtin ?? null;

  // REF: two number groups then an alphanumeric tail, e.g. 02.12.KA13R.
  // Tolerant of OCR spaces/O-for-0 around the code.
  const refMatch = upper.match(/([0O]?\d\.\s?\d{2}\.\s?[A-Z0-9]{3,})/);
  const refText = refMatch ? normalizeRef(refMatch[1]) : null;
  if (refText) fieldsRead.push("item number");

  if (gtin) fieldsRead.push("barcode");

  // Prefer the REF (printed on every label); fall back to the GTIN, which the
  // catalog learns the first time a rep matches a scanned box. Either one is an
  // exact identifier, so a hit on it is authoritative.
  let match: CatalogItem | null = null;
  if (refText) {
    match = catalog.find((c) => c.item_number && normalizeRef(c.item_number) === refText) ?? null;
  }
  if (!match && gtin) {
    match = catalog.find((c) => c.gtin === gtin) ?? null;
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

  // LOT: prefer the UDI (10) value; else fall back to scanning past the "LOT"
  // keyword for the first digit-containing token that isn't another field's
  // label — labels print "LOT" and its code in adjacent cells, and OCR on a
  // boxed layout doesn't reliably keep them textually adjacent.
  let lot: string | null = gs1?.lot ?? null;
  if (!lot) {
    const LOT_STOPWORDS = new Set([
      "LOT", "SIZE", "SIDE", "REF", "GTIN", "HEIGHT", "CEMENTED", "CEMENTLESS",
      "LEFT", "RIGHT", "COMPONENT", "FEMORAL", "TIBIAL", "INSERT",
    ]);
    const lotKeywordIdx = upper.search(/\bLOT\b/);
    if (lotKeywordIdx !== -1) {
      const window = upper.slice(lotKeywordIdx, lotKeywordIdx + 60);
      const tokens = window.match(/\b[A-Z0-9][A-Z0-9-]{3,10}\b/g) ?? [];
      lot = tokens.find((t) => /\d/.test(t) && !LOT_STOPWORDS.has(t)) ?? null;
    }
  }
  if (lot) fieldsRead.push("lot");

  // Expiration: prefer UDI (17); else the printed 20xx-mm-dd hourglass line.
  let expiration: string | null = gs1?.expiration ?? null;
  if (!expiration) {
    const expMatch = text.match(/\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
    expiration = expMatch ? `${expMatch[1]}-${expMatch[2]}-${expMatch[3]}` : null;
  }
  if (expiration) fieldsRead.push("expiration");

  return { refText, gtin, match, side, size, height, cement, lot, expiration, fieldsRead };
}
