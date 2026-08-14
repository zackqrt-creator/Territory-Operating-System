/**
 * Tests for what a single scan fills into the Add-item form.
 *
 * Run with:  npm run test:scan
 *
 * The bug these exist to prevent: the Scan page reduced a decoded GS1 element
 * string to its GTIN before handing it to the Add-item sheet, so the lot and
 * expiry encoded alongside the GTIN were gone before anything could read them.
 * The sheet then parsed a bare GTIN, got null, and filled the barcode field
 * only -- on a box whose barcode carried all three. The GS1 payloads below are
 * the real thing off Medacta packaging, separators and all.
 */
import { prefillFromScan, parseGs1 } from "../src/lib/labelParse.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${extra ? `\n        ${extra}` : ""}`);
  }
};

const GS = String.fromCharCode(29);

console.log("\nprefillFromScan");

// A GS1 data-matrix as zxing hands it over: FNC1, GTIN, expiry, lot.
{
  const scanned = `${GS}010763097126099317310311102604455`;
  const p = prefillFromScan(scanned);
  check("data-matrix → GTIN in the barcode field", p.barcode === "07630971260993", p.barcode);
  check("data-matrix → lot", p.lot === "2604455", String(p.lot));
  check("data-matrix → expiry as YYYY-MM-DD", p.expiration === "2031-03-11", String(p.expiration));
}

// The same code with an AIM symbology prefix, which some decoders add.
{
  const p = prefillFromScan("]d2010763097126099317310311102604455");
  check("AIM prefix → GTIN", p.barcode === "07630971260993", p.barcode);
  check("AIM prefix → lot", p.lot === "2604455", String(p.lot));
}

/*
 * The same code as zxing-cpp actually hands it over from a live frame.
 *
 * The reader escapes the FNC1 as the four literal characters "<GS>" when it
 * has flagged the symbol as GS1 — verified in Chromium, character codes
 * 60,71,83,62. The AI walker's leading-digit guard rejects that exactly as it
 * once rejected a raw FNC1, so without normalising it parseGs1 returns null
 * for a barcode that decoded perfectly and the lot and expiry vanish.
 */
{
  const p = prefillFromScan("<GS>010763097126253917310504102609637");
  check("escaped <GS> → GTIN", p.barcode === "07630971262539", p.barcode);
  check("escaped <GS> → lot", p.lot === "2609637", String(p.lot));
  check("escaped <GS> → expiry", p.expiration === "2031-05-04", String(p.expiration));
}

// A separator between variable-length fields, escaped the same way.
{
  const p = prefillFromScan("<GS>0107630971262539<GS>102609637<GS>17310504");
  check("escaped separators mid-string → lot", p.lot === "2609637", String(p.lot));
  check("escaped separators mid-string → expiry", p.expiration === "2031-05-04", String(p.expiration));
}

// The printed UDI line, which OCR reads in parenthesized form.
{
  const p = prefillFromScan("(01)07630345716248(17)301014(10)2520862");
  check("printed UDI → GTIN", p.barcode === "07630345716248", p.barcode);
  check("printed UDI → lot", p.lot === "2520862", String(p.lot));
  check("printed UDI → expiry", p.expiration === "2030-10-14", String(p.expiration));
}

// The regression itself: reducing first destroys the other two fields, and the
// reduced value no longer parses at all. This is what the app used to do.
{
  const full = `${GS}010763097126099317310311102604455`;
  const reduced = prefillFromScan(full).barcode;
  check("a bare GTIN is not a GS1 element string", parseGs1(reduced) === null);
  const p = prefillFromScan(reduced);
  check("reducing before prefilling loses the lot", p.lot === null);
  check("reducing before prefilling loses the expiry", p.expiration === null);
  check("...and the barcode field still survives", p.barcode === "07630971260993", p.barcode);
}

// A plain UPC/EAN off a consumable — no AIs to read, and it must not be walked
// as one: "07" is not an AI and the rest is not a lot.
{
  const p = prefillFromScan("012345678905");
  check("plain UPC → used as-is", p.barcode === "012345678905", p.barcode);
  check("plain UPC → no invented lot", p.lot === null, String(p.lot));
  check("plain UPC → no invented expiry", p.expiration === null, String(p.expiration));
}

// GS1 "end of month" day 00 → the month's last day, not an invalid date.
{
  const p = prefillFromScan(`(01)07630345716248(17)300200(10)X1`);
  check("expiry day 00 → last day of the month", p.expiration === "2030-02-28", String(p.expiration));
}

console.log(failures === 0 ? "\nAll scan-prefill tests passed.\n" : `\n${failures} failing.\n`);
process.exit(failures === 0 ? 0 : 1);
