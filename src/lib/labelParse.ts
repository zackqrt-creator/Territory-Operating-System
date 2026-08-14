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
  /** Product family off the header band, display-cased: "GMK Sphere Primary". */
  productLine: string | null;
  /** Knee or hip, from the product family — the label never says which. */
  joint: "KNEE" | "HIP" | null;
  /** What the box says the device is, display-cased: "Tibial Insert Fixed". */
  deviceDescription: string | null;
  /** Insert thickness as printed, e.g. "10mm" (THICKNESS cell). */
  thickness: string | null;
  /** Patella diameter as printed, e.g. "32mm" (the Ø cell). */
  diameter: string | null;
  /** Insert type, e.g. "Flex" (TYPE cell). */
  insertType: string | null;
  /** E-CROSS and the like — printed beside the family, part of the identity. */
  material: string | null;
  /** Product line + device, deduped: "Moto Patella Resurfacing". */
  suggestedName: string | null;
  /** Size plus whatever dimension the device carries: "4 · 10mm", "3 · Ø32mm". */
  suggestedSizeLabel: string | null;
  /** Human list of which fields we actually pulled, for the "verify" note. */
  fieldsRead: string[];
}

function normalizeRef(raw: string): string {
  // OCR sometimes reads leading 0 as O and adds spaces around dots.
  return raw.toUpperCase().replace(/\s+/g, "").replace(/O/g, "0");
}

/*
 * Vocabularies, matched against the label rather than read freely off it.
 *
 * Free text is the wrong tool here: a Medacta box is a boxed table printed
 * sideways, and OCR of one returns the cells in an order nobody can predict,
 * with the header band letter-spaced ("S P H E R E  P R I M A R Y"). Reading
 * "whatever is on the second line" off that yields garbage often enough to be
 * worse than nothing, because a wrong product name looks exactly as confident
 * as a right one. Matching known strings instead means an unrecognised box
 * fills nothing and says so, which the rep can act on.
 *
 * Each entry is [what to look for, how to write it]. The display form is not
 * derivable -- "GMK" stays shouted, "Moto" does not -- so it is stated.
 * Longest first: "Tibial Insert Fixed" must win over "Tibial Insert".
 */
type Vocab = readonly (readonly [string, string])[];

/**
 * Product families, each tagged with the joint it belongs to — the label never
 * prints "knee" or "hip", but the family settles it, and the form needs it to
 * offer the right device-type and product-line lists.
 */
const PRODUCT_FAMILIES: readonly (readonly [string, string, "KNEE" | "HIP"])[] = [
  ["GMK SPHERE PRIMARY", "GMK Sphere Primary", "KNEE"],
  ["GMK SPHERIKA", "GMK Spherika", "KNEE"],
  ["GMK REVISION", "GMK Revision", "KNEE"],
  ["GMK SPHERE", "GMK Sphere", "KNEE"],
  ["GMK PRIMARY", "GMK Primary", "KNEE"],
  ["MOTO PATELLA", "Moto Patella", "KNEE"],
  ["MOTO PFJ", "Moto PFJ", "KNEE"],
  ["KA ONE", "KA One", "KNEE"],
  ["M-VIZION", "M-Vizion", "HIP"],
  ["MASTERLOC", "MasterLoc", "HIP"],
  ["VERSAFITCUP", "Versafitcup", "HIP"],
  ["AMISTEM-P", "AMIStem-P", "HIP"],
  ["QUADRA-P", "Quadra-P", "HIP"],
  ["QUADRA-R", "Quadra-R", "HIP"],
  ["MECTACEM-X", "MectaCem-X", "HIP"],
  ["X-ACTA", "X-ACTA", "HIP"],
  ["MPACT", "Mpact", "HIP"],
];

const DEVICE_DESCRIPTIONS: Vocab = [
  ["TIBIAL INSERT FIXED", "Tibial Insert Fixed"],
  ["TIBIAL INSERT MOBILE", "Tibial Insert Mobile"],
  ["PATELLA RESURFACING", "Patella Resurfacing"],
  ["FEMORAL COMPONENT", "Femoral Component"],
  ["REVISION FEMORAL", "Revision Femoral"],
  ["ACETABULAR CUP", "Acetabular Cup"],
  ["TIBIAL INSERT", "Tibial Insert"],
  ["INSTRUMENT TRAY", "Instrument Tray"],
  ["FEMORAL HEAD", "Femoral Head"],
  ["FEMORAL STEM", "Femoral Stem"],
  ["BIPOLAR HEAD", "Bipolar Head"],
  ["TIBIAL TRAY", "Tibial Tray"],
  ["BONE CEMENT", "Bone Cement"],
  ["PATELLA", "Patella"],
  ["LINER", "Liner"],
];

const MATERIALS: Vocab = [
  ["E-CROSS", "E-Cross"],
  ["VIT-E", "Vit-E"],
  ["HIGHCROSS", "HighCross"],
];

/** TYPE cell values. A whitelist, so the cell after it can't be swallowed. */
const INSERT_TYPES: Vocab = [
  ["STANDARD", "Standard"],
  ["FLEX", "Flex"],
  ["STD", "Standard"],
  ["UC", "UC"],
  ["CR", "CR"],
  ["PS", "PS"],
  ["CS", "CS"],
];

/**
 * Match a vocabulary against the label with every non-alphanumeric character
 * removed from both sides.
 *
 * The header band is letter-spaced on Medacta packaging, so OCR returns
 * "G M K  S P H E R E  P R I M A R Y" and a word-boundary search finds
 * nothing. Squashing both sides makes that match "GMKSPHEREPRIMARY", and the
 * entries are long enough that squashing them together cannot collide.
 */
function squashedIncludes(upper: string, needle: string): boolean {
  return upper.replace(/[^A-Z0-9]/g, "").includes(needle.replace(/[^A-Z0-9]/g, ""));
}

function matchVocab(upper: string, vocab: Vocab): string | null {
  for (const [needle, display] of vocab) {
    if (squashedIncludes(upper, needle)) return display;
  }
  return null;
}

/**
 * Read a boxed cell's value: "<KEYWORD> <value>" when OCR kept them together,
 * else the first token in the next stretch of text that fits `accept`.
 *
 * Adjacency alone is not enough. These are table cells with a rule between
 * them, and on a sideways photo the recognizer regularly emits the keyword and
 * its value with the neighbouring column's text in between -- which is exactly
 * why the existing lot reader already works this way.
 */
function readCell(upper: string, keyword: string, accept: RegExp): string | null {
  const idx = upper.search(new RegExp(`\\b${keyword}\\b`));
  if (idx === -1) return null;
  const window = upper.slice(idx + keyword.length, idx + keyword.length + 40);
  const tokens = window.match(/[A-Z0-9][A-Z0-9.+/-]*/g) ?? [];
  for (const token of tokens) {
    // Another cell's label means we have walked out of this cell.
    if (/^(SIZE|SIDE|TYPE|THICKNESS|HEIGHT|LOT|REF|GTIN|UDI)$/.test(token)) break;
    const m = token.match(accept);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

/**
 * Product line and device description joined without saying the shared word
 * twice: "Moto Patella" + "Patella Resurfacing" is "Moto Patella Resurfacing",
 * not "Moto Patella Patella Resurfacing".
 */
export function composeItemName(productLine: string | null, device: string | null): string | null {
  if (!productLine) return device;
  if (!device) return productLine;
  const tail = productLine.split(" ").pop()!.toUpperCase();
  const words = device.split(" ");
  if (words[0].toUpperCase() === tail) words.shift();
  return [productLine, ...words].join(" ").trim();
}

/**
 * The size cell plus whatever second dimension the device carries -- thickness
 * for an insert, diameter for a patella. The separator matches what the seeded
 * catalog already uses for these ("4 · 10mm"), so a scanned entry sorts and
 * reads alongside the ones that were migrated in.
 */
export function composeSizeLabel(scan: {
  size: string | null;
  thickness: string | null;
  diameter: string | null;
  height: string | null;
}): string | null {
  const second = scan.thickness ?? (scan.diameter ? `Ø${scan.diameter}` : null) ?? scan.height;
  const parts = [scan.size, second].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
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
  /*
   * ...and then strip a leading FNC1. A GS1 data-matrix encodes FNC1 in the
   * first position, and decoders surface that as ASCII 29 at the head of the
   * payload: a real code off an implant box decodes to "\x1d0107630971260993
   * 17310311102604455", not to "0107...". The AI walker below starts with a
   * `/^\d{2}/` guard, so that leading separator made parseGs1 return null for
   * every correctly-read data-matrix in the app -- the primary symbol on
   * Medacta packaging -- and the rep was told "not a recognized barcode" about
   * a barcode that had just been decoded perfectly.
   */
  const SEPARATOR = String.fromCharCode(29);
  let raw = input.replace(/^\][A-Za-z]\d/, "");
  while (raw.startsWith(SEPARATOR)) raw = raw.slice(1);
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

export interface ScanPrefill {
  /** What belongs in the item's barcode field: the GTIN when there is one. */
  barcode: string;
  lot: string | null;
  expiration: string | null; // YYYY-MM-DD
}

/**
 * Everything a single scanned code can fill in, derived in one place.
 *
 * This exists because the caller must not reduce the code before handing it
 * on. A GS1 element string carries the GTIN, the lot (AI 10) and the expiry
 * (AI 17) together; reduce it to its GTIN first -- which the lookup wants --
 * and the other two are gone for good, and parseGs1 called on what is left
 * returns null because a bare GTIN is not an element string. That is precisely
 * how the Add-item sheet came to fill the barcode and nothing else off a label
 * that had all three printed on it.
 *
 * So: pass the raw decoded text here, and take the reduction from the result.
 */
export function prefillFromScan(code: string): ScanPrefill {
  // The decoded text with the decoder's own AIM prefix and any FNC1
  // separators taken off — what to show when there are no AIs to read. The
  // separator goes via fromCharCode, as everywhere else here: a control
  // character inside a regex reads as a smudge and the linter objects to it.
  const plain = code
    .replace(/^\][A-Za-z]\d/, "")
    .split(String.fromCharCode(29))
    .join("")
    .replace(/\s/g, "");

  /*
   * A bare 12-14 digit run is a plain UPC/EAN/GTIN carrying no application
   * identifiers, and it must not reach the AI walker: that would read the
   * leading "01" as the GTIN AI and take the next 14 characters as the GTIN --
   * of which a 12-digit UPC has only 10 -- yielding a barcode value that was
   * never printed on anything and matches nothing. A real element string
   * carrying just a GTIN is 16 characters, so nothing genuine is caught here.
   */
  if (/^\d{12,14}$/.test(plain)) return { barcode: plain, lot: null, expiration: null };

  const gs1 = parseGs1(code);
  return {
    barcode: gs1?.gtin ?? plain,
    lot: gs1?.lot ?? null,
    expiration: gs1?.expiration ?? null,
  };
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

  // SIZE (may carry a trailing +). Adjacent first, then the cell reader for
  // the sideways-photo case where the value lands away from its keyword.
  const sizeMatch = upper.match(/\bSIZE\s*:?\s*(\d\+?)\b/);
  const size = sizeMatch ? sizeMatch[1] : readCell(upper, "SIZE", /^(\d\+?)$/);
  if (size) fieldsRead.push("size");

  // HEIGHT (inserts), e.g. "HEIGHT 14 mm"
  const heightMatch = upper.match(/\bHEIGHT\s*:?\s*(\d{2})\s*MM/);
  const height = heightMatch ? heightMatch[1] : null;
  if (height) fieldsRead.push("height");

  // THICKNESS (inserts), e.g. "THICKNESS 10 mm" — the number the rep needs to
  // tell one insert from the five others of the same size in the tote.
  const thicknessMatch = upper.match(/\bTHICKNESS\s*:?\s*(\d{1,2})\s*MM\b/);
  const thicknessDigits = thicknessMatch ? thicknessMatch[1] : readCell(upper, "THICKNESS", /^(\d{1,2})$/);
  const thickness = thicknessDigits ? `${thicknessDigits}mm` : null;
  if (thickness) fieldsRead.push("thickness");

  /*
   * Ø diameter (patellae). The symbol itself is not readable: it is a small
   * glyph in a table rule and OCR returns it as 0, O, @, (), or nothing at all,
   * differently on each photo. So the symbol is optional here -- what makes
   * this safe is that a bare two-digit millimetre value only appears in this
   * cell, and a device that has a THICKNESS or HEIGHT cell is not a patella,
   * so those win and this is not consulted.
   */
  let diameter: string | null = null;
  if (!thickness && !height) {
    const diaMatch = upper.match(/[Ø0O@()\s](\d{2})\s*MM\b/);
    diameter = diaMatch ? `${diaMatch[1]}mm` : null;
    if (diameter) fieldsRead.push("diameter");
  }

  // TYPE (inserts), e.g. "TYPE FLEX".
  const typeCell = readCell(upper, "TYPE", /^[A-Z]{2,10}$/);
  const insertType = typeCell ? matchVocab(typeCell, INSERT_TYPES) : null;
  if (insertType) fieldsRead.push("type");

  // Identity off the printed header band and description line.
  const family = PRODUCT_FAMILIES.find(([needle]) => squashedIncludes(upper, needle)) ?? null;
  const productLine = family?.[1] ?? null;
  const joint = family?.[2] ?? null;
  if (productLine) fieldsRead.push("product line");
  const deviceDescription = matchVocab(upper, DEVICE_DESCRIPTIONS);
  if (deviceDescription) fieldsRead.push("device");
  const material = matchVocab(upper, MATERIALS);

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

  return {
    refText,
    gtin,
    match,
    side,
    size,
    height,
    cement,
    lot,
    expiration,
    productLine,
    joint,
    deviceDescription,
    thickness,
    diameter,
    insertType,
    material,
    suggestedName: composeItemName(productLine, deviceDescription),
    suggestedSizeLabel: composeSizeLabel({ size, thickness, diameter, height }),
    fieldsRead,
  };
}
