import type { CatalogItem, Facility } from "./types";
import type { LabelScan } from "./labelParse";
import type { SheetSticker, StickerMatch } from "./stickerSheet";

/**
 * Parses MyOps' "Digital Ticket" — the post-case usage report Medacta emails
 * per case, listing every item consumed with its own item number, lot,
 * expiry, and a Repl. (replenish) flag. Where the sticker-sheet path (OCR of
 * a photographed paper) has to guess at print quality, this one is exact:
 * it's typed text pasted straight out of the ticket, so the item number is
 * ground truth rather than a best-effort read.
 *
 * Territory OS runs beside MyOps, not instead of it — MyOps stays the billing
 * and audit system of record. This only exists to save the rep from manually
 * re-typing what MyOps already told them, so the same units come off local
 * inventory and the same replenish flags turn into a task.
 *
 * Output is shaped as SheetSticker[] so it plugs straight into the existing
 * matchSheet/consumeStickerUsage pipeline built for the sticker-sheet flow —
 * one allocation engine, one deduction path, two ways to feed it.
 */

/** Implant/instrument REFs: `02.07.1202L`, `02.12.E0210FL` (3-segment) or
 * `11.01001` (2-segment instrument-set codes). */
const ITEM_NO = /\b\d{2}\.\d{2}\.[A-Z0-9]{3,8}\b|\b\d{2}\.\d{5}\b/g;

/** A 6-8 digit lot number, standalone (never part of a REF or a price). */
const LOT = /\b(\d{6,8})\b/;

/** `Mar 24 2031`, `Dec 28 2030`. */
const EXPIRY = /\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/;

const LOC = /\b(Cons\.|Consignment|Loaner)/i;
const REPL = /\b(Yes|No)\b/i;

/** The Qty column: an integer immediately followed by a `$` unit price. */
const QTY_BEFORE_PRICE = /\b(\d{1,3})\s*\$/;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIsoDate(m: RegExpMatchArray | null): string | null {
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2].padStart(2, "0")}`;
}

export interface TicketHeader {
  caseNumber: string | null;
  hospital: string | null;
  surgeon: string | null;
  surgeryDate: string | null; // YYYY-MM-DD
}

export interface TicketLine {
  itemNumber: string;
  description: string | null;
  lot: string | null;
  expiry: string | null;
  /** true when the Loc. column reads "Cons." — the case's own consignment stock. */
  consignment: boolean;
  /** MyOps' own "needs replenishing" flag. */
  replenish: boolean;
  quantity: number;
  match: CatalogItem | null;
}

export interface DigitalTicketScan {
  header: TicketHeader;
  lines: TicketLine[];
  matchedCount: number;
}

function parseHeader(text: string): TicketHeader {
  const caseNo = text.match(/\bCase\s+(\d{4,8})\b/i);
  const surgeon = text.match(/Surgeon:\s*([A-Za-z.,'\- ]+?)(?:\r?\n|Agent:|Location:|$)/i);
  const date = text.match(/Surgery Date:\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
  // The hospital line sits right after the "Hospital" label, before its address.
  const hospital = text.match(/Hospital\s*\r?\n\s*(?:[A-Z]\d{3,5}\s*-\s*)?(.+?)(?:\r?\n)/i);

  return {
    caseNumber: caseNo ? caseNo[1] : null,
    surgeon: surgeon ? surgeon[1].trim() : null,
    surgeryDate: toIsoDate(date),
    hospital: hospital ? hospital[1].trim() : null,
  };
}

function findInCatalog(itemNumber: string, catalog: CatalogItem[]): CatalogItem | null {
  const exact = catalog.find((c) => c.item_number?.toUpperCase() === itemNumber);
  if (exact) return exact;
  const bare = itemNumber.replace(/[^A-Z0-9]/g, "");
  return catalog.find((c) => (c.item_number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === bare) ?? null;
}

/**
 * Pulls the description between an item number and the lot that follows it —
 * same technique as the packing-slip parser, since it's the same table shape.
 */
function descriptionNear(text: string, from: number, to: number): string | null {
  const chunk = text.slice(from, to).replace(/\s+/g, " ").trim();
  return chunk.length >= 3 ? chunk.slice(0, 160) : null;
}

export function parseDigitalTicket(text: string, catalog: CatalogItem[]): DigitalTicketScan {
  const header = parseHeader(text);

  const hits: { itemNumber: string; index: number; end: number }[] = [];
  for (const m of text.matchAll(ITEM_NO)) {
    const index = m.index ?? 0;
    hits.push({ itemNumber: m[0].toUpperCase(), index, end: index + m[0].length });
  }

  const lines: TicketLine[] = [];
  hits.forEach((hit, i) => {
    const windowEnd = hits[i + 1]?.index ?? text.length;
    const window = text.slice(hit.end, windowEnd);

    const lotMatch = window.match(LOT);
    const expMatch = window.match(EXPIRY);
    const locMatch = window.match(LOC);
    const replMatch = window.match(REPL);
    const qtyMatch = window.match(QTY_BEFORE_PRICE);

    const description = descriptionNear(text, hit.end, lotMatch?.index != null ? hit.end + lotMatch.index : windowEnd);

    lines.push({
      itemNumber: hit.itemNumber,
      description,
      lot: lotMatch ? lotMatch[1] : null,
      expiry: toIsoDate(expMatch),
      consignment: !!locMatch && /cons/i.test(locMatch[1]),
      replenish: !!replMatch && /yes/i.test(replMatch[1]),
      quantity: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      match: findInCatalog(hit.itemNumber, catalog),
    });
  });

  return { header, lines, matchedCount: lines.filter((l) => l.match).length };
}

/** Reshapes ticket lines into the sticker-sheet engine's input, so one
 * allocation/deduction pipeline serves both capture paths. */
export function ticketLinesToStickers(lines: TicketLine[]): SheetSticker[] {
  return lines.map((l) => {
    const scan: LabelScan = {
      refText: l.itemNumber,
      gtin: null,
      match: l.match,
      side: null,
      size: null,
      height: null,
      cement: null,
      lot: l.lot,
      expiration: l.expiry,
      productLine: null,
      joint: null,
      deviceDescription: l.description,
      thickness: null,
      diameter: null,
      insertType: null,
      material: null,
      suggestedName: l.match?.name ?? l.description,
      suggestedSizeLabel: null,
      fieldsRead: [],
    };
    return { scan, quantity: l.quantity };
  });
}

/**
 * Body for the reorder task raised off a confirmed ticket import. Unlike the
 * sticker-sheet version, inclusion follows the ticket's own Repl. flag —
 * MyOps already knows which lines need replenishing, so that's trusted over
 * re-deriving it from what's left in local stock.
 *
 * `matches` must be index-aligned with `lines` (both derive from the same
 * ticketLinesToStickers → matchSheet call, in the same order).
 */
export function buildTicketReplenishNotes(
  lines: TicketLine[],
  matches: StickerMatch[],
  confirmed: ReadonlySet<number>,
  facilities: Facility[],
): string {
  const locName = (id: string | null | undefined) =>
    facilities.find((f) => f.id === id)?.name ?? "unknown location";
  const out: string[] = [];

  lines.forEach((line, i) => {
    if (!confirmed.has(i)) return;
    const m = matches[i];
    if (line.replenish) {
      const name = line.match?.name ?? line.description ?? line.itemNumber;
      if (m.allocations.length > 0) {
        for (const a of m.allocations) {
          out.push(`• Replenish ${line.itemNumber} ${name} — pulled from ${locName(a.item.location_id)}`);
        }
      } else {
        out.push(`• Replenish ${line.itemNumber} ${name} — not in local inventory to pull from, order fresh`);
      }
    }
    if (m.shortfall > 0) {
      out.push(`⚠ ${m.shortfall}× ${line.itemNumber} used but not enough stock in inventory to deduct — count is now off, verify.`);
    }
  });

  if (out.length === 0) out.push("Nothing on this ticket was flagged for replenishment.");
  return out.join("\n");
}
