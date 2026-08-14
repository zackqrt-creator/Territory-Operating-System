/**
 * Tests for reading a Medacta implant label.
 *
 * Run with:  npm run test:label
 *
 * The two fixtures below are the two boxes this was built against: a Moto
 * Patella resurfacing button and a GMK Sphere Primary tibial insert. Each is
 * written the way tesseract actually returns one -- the header band
 * letter-spaced, and the cells out of reading order, because the label is a
 * boxed table photographed sideways and the recognizer walks it by pixel row,
 * not by the order a person would read it.
 *
 * What must come off them is everything the rep would otherwise type: what the
 * device is, its size and second dimension, side, cement, lot and expiry.
 */
import { parseLabelText, composeItemName, composeSizeLabel } from "../src/lib/labelParse.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${extra ? `\n        ${extra}` : ""}`);
  }
};

// ---------------------------------------------------------------------------
// Moto Patella — REF 02.15.E032, cemented, size 3, Ø 32mm
// ---------------------------------------------------------------------------
const MOTO_PATELLA = `
Moto PATELLA
PARTIAL KNEE SYSTEM
PATELLA RESURFACING
E-CROSS
REF 02.15.E032
GTIN 07630971262539
LOT 2609637
2031-05-04
CEMENTED
SIZE 3
0 32mm
UDI (01)07630971262539(17)310504(10)2609637
`;

console.log("\nMoto Patella label");
{
  const s = parseLabelText(MOTO_PATELLA, []);
  check("product line", s.productLine === "Moto Patella", String(s.productLine));
  check("device description", s.deviceDescription === "Patella Resurfacing", String(s.deviceDescription));
  check("name reads as one phrase, not a doubled word", s.suggestedName === "Moto Patella Resurfacing", String(s.suggestedName));
  check("cemented", s.cement === "cemented", String(s.cement));
  check("size", s.size === "3", String(s.size));
  check("diameter off the Ø cell", s.diameter === "32mm", String(s.diameter));
  check("size label combines both", s.suggestedSizeLabel === "3 · Ø32mm", String(s.suggestedSizeLabel));
  check("lot", s.lot === "2609637", String(s.lot));
  check("expiration", s.expiration === "2031-05-04", String(s.expiration));
  check("REF", s.refText === "02.15.E032", String(s.refText));
  check("GTIN", s.gtin === "07630971262539", String(s.gtin));
  check("no side invented on an unsided device", s.side === null, String(s.side));
  check("no thickness invented", s.thickness === null, String(s.thickness));
}

// ---------------------------------------------------------------------------
// GMK Sphere Primary tibial insert — REF 02.12.E0410FR, size 4, right, 10mm
// The header band is letter-spaced on the box, and OCR reproduces that.
// ---------------------------------------------------------------------------
const GMK_INSERT = `
GMK S P H E R E   P R I M A R Y
E-CROSS
TIBIAL INSERT FIXED
REF 02.12.E0410FR
GTIN 07630971261761
LOT 2609601
2031-05-18
TYPE FLEX
THICKNESS 10 mm
SIZE 4
SIDE RIGHT
UDI (01)07630971261761(17)310518(10)2609601
`;

console.log("\nGMK Sphere Primary tibial insert label");
{
  const s = parseLabelText(GMK_INSERT, []);
  check("product line through a letter-spaced header", s.productLine === "GMK Sphere Primary", String(s.productLine));
  check("device description", s.deviceDescription === "Tibial Insert Fixed", String(s.deviceDescription));
  check("material", s.material === "E-Cross", String(s.material));
  check("name", s.suggestedName === "GMK Sphere Primary Tibial Insert Fixed", String(s.suggestedName));
  check("size", s.size === "4", String(s.size));
  check("side", s.side === "RIGHT", String(s.side));
  check("thickness", s.thickness === "10mm", String(s.thickness));
  check("type", s.insertType === "Flex", String(s.insertType));
  check("size label matches the seeded catalog's shape", s.suggestedSizeLabel === "4 · 10mm", String(s.suggestedSizeLabel));
  check("lot", s.lot === "2609601", String(s.lot));
  check("expiration", s.expiration === "2031-05-18", String(s.expiration));
  check("no diameter on a device that has a thickness", s.diameter === null, String(s.diameter));
}

// ---------------------------------------------------------------------------
// Same insert, cells scrambled the way a sideways photo scrambles them: the
// keyword and its value land in different runs of text.
// ---------------------------------------------------------------------------
const GMK_INSERT_SCRAMBLED = `
SIZE SIDE THICKNESS
4 RIGHT 10 mm
GMK SPHERE PRIMARY E-CROSS TIBIAL INSERT FIXED
REF 02.12.E0410FR LOT 2609601 2031-05-18
`;

console.log("\nSame insert, cells out of order");
{
  const s = parseLabelText(GMK_INSERT_SCRAMBLED, []);
  // The keyword row and the value row are separate: SIZE's own window runs
  // through SIDE and THICKNESS, so it must stop at the next cell label rather
  // than reading "4" as belonging to whichever keyword came first.
  check("does not attribute a value to the wrong cell", s.size === null || s.size === "4", String(s.size));
  check("device still reads", s.deviceDescription === "Tibial Insert Fixed", String(s.deviceDescription));
  check("product line still reads", s.productLine === "GMK Sphere Primary", String(s.productLine));
  check("lot still reads", s.lot === "2609601", String(s.lot));
}

// ---------------------------------------------------------------------------
// A catalog hit outranks everything read off the print.
// ---------------------------------------------------------------------------
const CATALOG = [
  {
    id: "cat-1",
    territory_id: "t",
    item_number: "02.12.E0410FR",
    name: "GMK-SPHERE tibial insert E-Cross - Flex 4R - 10mm",
    category: "implant",
    product_line: "GMK Sphere",
    side: "RIGHT",
    size_label: "Flex 4",
    cement_type: "NA",
    joint: "KNEE",
    device_type: "Tibial Insert",
    gtin: null,
    equivalent_loaner_code: null,
    created_at: "",
  },
];

console.log("\nCatalog match");
{
  const s = parseLabelText(GMK_INSERT, CATALOG);
  check("matches on REF", s.match?.id === "cat-1", String(s.match?.id));
  check("still reports lot for the unit", s.lot === "2609601", String(s.lot));
  check("still reports expiry for the unit", s.expiration === "2031-05-18", String(s.expiration));
}

// ---------------------------------------------------------------------------
// Composition helpers on their own.
// ---------------------------------------------------------------------------
console.log("\nComposition");
{
  check("drops the repeated word", composeItemName("Moto Patella", "Patella Resurfacing") === "Moto Patella Resurfacing");
  check("keeps distinct words", composeItemName("GMK Sphere Primary", "Tibial Insert Fixed") === "GMK Sphere Primary Tibial Insert Fixed");
  check("device alone", composeItemName(null, "Tibial Tray") === "Tibial Tray");
  check("family alone", composeItemName("KA One", null) === "KA One");
  check("nothing at all", composeItemName(null, null) === null);
  check(
    "thickness wins over diameter",
    composeSizeLabel({ size: "4", thickness: "10mm", diameter: "32mm", height: null }) === "4 · 10mm",
  );
  check(
    "size on its own",
    composeSizeLabel({ size: "5+", thickness: null, diameter: null, height: null }) === "5+",
  );
  check(
    "nothing to compose",
    composeSizeLabel({ size: null, thickness: null, diameter: null, height: null }) === null,
  );
}

// ---------------------------------------------------------------------------
// Joint comes off the family, because no label prints "knee" or "hip". It
// decides which device-type and product-line lists the form offers, so getting
// it wrong renders those dropdowns blank.
// ---------------------------------------------------------------------------
console.log("\nJoint inference");
{
  check("knee from GMK", parseLabelText(GMK_INSERT, []).joint === "KNEE");
  check("knee from Moto", parseLabelText(MOTO_PATELLA, []).joint === "KNEE");
  check(
    "hip from a hip family",
    parseLabelText("MasterLoc FEMORAL STEM REF 01.02.ABC SIZE 3", []).joint === "HIP",
  );
  check("unknown family leaves it unset", parseLabelText("SIZE 3", []).joint === null);
}

// ---------------------------------------------------------------------------
// A label we know nothing about fills nothing rather than guessing.
// ---------------------------------------------------------------------------
console.log("\nUnknown packaging");
{
  const s = parseLabelText("STERILE R  DO NOT REUSE  SINGLE USE ONLY", []);
  check("no product invented", s.productLine === null && s.deviceDescription === null);
  check("no name invented", s.suggestedName === null, String(s.suggestedName));
  check("nothing claimed as read", s.fieldsRead.length === 0, s.fieldsRead.join(","));
}

console.log(failures === 0 ? "\nAll label-parse tests passed.\n" : `\n${failures} failing.\n`);
process.exit(failures === 0 ? 0 : 1);
