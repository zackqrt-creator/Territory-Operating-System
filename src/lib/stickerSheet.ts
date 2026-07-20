import type { CatalogItem, Facility, InventoryItem } from "./types";
import { parseLabelText, type LabelScan } from "./labelParse";

/**
 * Sticker-sheet engine. After a case, the rep sticks one peel-off label per
 * implanted device onto the case paper. One photo of that paper is OCR'd here
 * into individual stickers, each matched against the territory's inventory.
 *
 * NOTHING is deducted automatically — the caller shows a review list and only
 * confirmed, matched lines are consumed. An unmatched sticker is surfaced and
 * flagged, never guessed into a deduction.
 */

export interface SheetSticker {
  scan: LabelScan;
  /** Same REF + same lot appearing more than once on the sheet. */
  quantity: number;
}

/** Every sticker on the page: split the OCR text at each REF occurrence and
 * parse each chunk as one label. Duplicate REF+lot pairs collapse into qty. */
export function parseStickerSheet(text: string, catalog: CatalogItem[]): SheetSticker[] {
  const upper = text.toUpperCase();
  const refRe = /[0O]?\d\.\s?\d{2}\.\s?[A-Z0-9]{3,}/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(upper)) !== null) starts.push(m.index);
  if (starts.length === 0) return [];

  const stickers: SheetSticker[] = [];
  for (let i = 0; i < starts.length; i++) {
    // First chunk reaches back to the top of the page so a lot printed above
    // the first REF isn't lost; later chunks start at their own REF.
    const from = i === 0 ? 0 : starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : text.length;
    const scan = parseLabelText(text.slice(from, to), catalog);
    if (!scan.refText) continue;

    const dup = stickers.find(
      (s) => s.scan.refText === scan.refText && s.scan.lot === scan.lot,
    );
    if (dup) dup.quantity += 1;
    else stickers.push({ scan, quantity: 1 });
  }
  return stickers;
}

export type MatchQuality =
  | "lot_here" // exact lot at the case facility — deduct with confidence
  | "lot_elsewhere" // exact lot, but stock lives at another location
  | "product_here" // right product at the facility, lot differs — verify
  | "product_elsewhere" // right product, another location, lot differs
  | "none"; // nothing in inventory matches — flag, never deduct

export interface StickerAllocation {
  item: InventoryItem;
  quantity: number;
  quality: Exclude<MatchQuality, "none">;
}

export interface StickerMatch {
  sticker: SheetSticker;
  /** Inventory rows this sticker will deduct from (may span rows). */
  allocations: StickerAllocation[];
  /** Units on the sheet we could NOT cover from inventory. */
  shortfall: number;
  /** Best allocation quality, or "none" if nothing matched at all. */
  quality: MatchQuality;
}

/**
 * Allocate every sticker on the sheet against inventory, tracking remaining
 * quantity per row so two stickers can never double-deduct the same unit.
 * Preference order per sticker: exact lot at the case facility → exact lot
 * anywhere → same product at the facility → same product anywhere. A sticker
 * needing more units than one row holds splits across rows. Loaner-tote
 * wrappers are never candidates (their contents are ordinary rows).
 */
export function matchSheet(
  stickers: SheetSticker[],
  inventory: InventoryItem[],
  facilityId: string | null,
): StickerMatch[] {
  const remaining = new Map<string, number>();
  for (const i of inventory) remaining.set(i.id, i.quantity);

  const byExpiry = (a: InventoryItem, b: InventoryItem) =>
    (a.expiration_date ?? "9999-12-31").localeCompare(b.expiration_date ?? "9999-12-31");

  return stickers.map((sticker) => {
    const { scan } = sticker;
    if (!scan.match) return { sticker, allocations: [], shortfall: sticker.quantity, quality: "none" };

    const candidates = inventory
      .filter(
        (i) =>
          !i.loaner_code &&
          (remaining.get(i.id) ?? 0) > 0 &&
          (i.catalog_item_id === scan.match!.id || i.name === scan.match!.name),
      )
      .sort(byExpiry);

    const tiers: { rows: InventoryItem[]; quality: Exclude<MatchQuality, "none"> }[] = [];
    if (scan.lot) {
      tiers.push({
        rows: candidates.filter((i) => i.lot_number === scan.lot && i.location_id === facilityId),
        quality: "lot_here",
      });
      tiers.push({
        rows: candidates.filter((i) => i.lot_number === scan.lot && i.location_id !== facilityId),
        quality: "lot_elsewhere",
      });
    }
    tiers.push({
      rows: candidates.filter((i) => i.lot_number !== scan.lot && i.location_id === facilityId),
      quality: "product_here",
    });
    tiers.push({
      rows: candidates.filter((i) => i.lot_number !== scan.lot && i.location_id !== facilityId),
      quality: "product_elsewhere",
    });

    const allocations: StickerAllocation[] = [];
    let need = sticker.quantity;
    for (const tier of tiers) {
      for (const row of tier.rows) {
        if (need <= 0) break;
        const avail = remaining.get(row.id) ?? 0;
        if (avail <= 0) continue;
        const take = Math.min(need, avail);
        allocations.push({ item: row, quantity: take, quality: tier.quality });
        remaining.set(row.id, avail - take);
        need -= take;
      }
    }

    return {
      sticker,
      allocations,
      shortfall: need,
      quality: allocations.length > 0 ? allocations[0].quality : "none",
    };
  });
}

/** Body for the auto-created reorder task: what was used, where it came from,
 * and — explicitly — what was on the sheet but never found in inventory. */
export function buildReorderNotes(
  confirmed: StickerMatch[],
  unmatched: StickerMatch[],
  facilities: Facility[],
): string {
  const locName = (id: string | null | undefined) =>
    facilities.find((f) => f.id === id)?.name ?? "unknown location";
  const lines: string[] = [];
  for (const m of confirmed) {
    const lot = m.sticker.scan.lot ? `, lot ${m.sticker.scan.lot}` : "";
    for (const a of m.allocations) {
      const qty = a.quantity > 1 ? `${a.quantity}× ` : "";
      lines.push(`• ${qty}${a.item.name} (REF ${m.sticker.scan.refText}${lot}) — pulled from ${locName(a.item.location_id)}`);
    }
    if (m.shortfall > 0) {
      const name = m.sticker.scan.match?.name ?? m.sticker.scan.refText;
      lines.push(`⚠ ${m.shortfall}× ${name} used but not enough stock in inventory to deduct — count is now off, verify.`);
    }
  }
  for (const m of unmatched) {
    const name = m.sticker.scan.match?.name ?? m.sticker.scan.refText;
    lines.push(`⚠ ${name} was on the sticker sheet but NOT found in inventory — nothing was deducted, reorder judgment call.`);
  }
  return lines.join("\n");
}
