import type { CaseRow, CatalogItem, Facility, InventoryItem, Side } from "./types";

/**
 * "Do I have enough for a day of cases?" engine.
 *
 * Demand model (the way a rep actually packs): for a knee case you bring a
 * full run of every size on that side, because the surgeon doesn't commit to a
 * size until they're in there. So N same-side cases need N units of EVERY size
 * on that side. One complete size-run == one case.
 *
 * Availability combines consignment and loaner stock (loaner tote contents are
 * inventory rows linked to the same catalog item), so the count answers "how
 * many size-3 right femurs do I have anywhere, owned or borrowed." Reserve
 * (Lodi) is counted but held apart: you'd rather order a loaner than raid it.
 *
 * Status ladder per size:
 *   ready   — covered without touching reserve
 *   reserve — only covered if you dip into Lodi (flag to replenish)
 *   short   — not covered even with Lodi → order a loaner
 */

export type ItemStatus = "ready" | "reserve" | "short";

export interface ReadinessLine {
  catalogItem: CatalogItem;
  demand: number;
  totalAvail: number;
  comfortableAvail: number;
  reserveAvail: number;
  consignmentAvail: number;
  loanerAvail: number;
  status: ItemStatus;
  needFromReserve: number;
  needToOrder: number;
  byLocation: { facility: Facility; quantity: number }[];
}

export interface ReadinessSection {
  key: string;
  deviceType: string;
  side: Side | "NA";
  demandPerSize: number;
  lines: ReadinessLine[];
  sizesReady: number;
  sizesReserve: number;
  sizesShort: number;
}

export interface InventorySummary {
  totalUnits: number;
  consignmentUnits: number;
  loanerUnits: number;
  byLocation: { facility: Facility; units: number; isReserve: boolean }[];
}

export interface DayReadiness {
  date: string;
  leftCases: number;
  rightCases: number;
  totalCases: number;
  sections: ReadinessSection[];
  worstStatus: ItemStatus | "none";
  summary: InventorySummary;
}

const STATUS_RANK: Record<ItemStatus, number> = { ready: 0, reserve: 1, short: 2 };

/** A loaner tote's own container row (has an outer code, no catalog link) — a
 * wrapper, not a counted unit. Its contents are separate rows. */
function isLoanerContainer(i: InventoryItem): boolean {
  return i.loaner_code != null;
}

export function buildInventorySummary(
  inventory: InventoryItem[],
  facilities: Facility[],
): InventorySummary {
  const counted = inventory.filter((i) => !isLoanerContainer(i));
  let consignmentUnits = 0;
  let loanerUnits = 0;
  const perLocation = new Map<string, number>();

  for (const i of counted) {
    if (i.acquisition_type === "loaner") loanerUnits += i.quantity;
    else consignmentUnits += i.quantity;
    perLocation.set(i.location_id, (perLocation.get(i.location_id) ?? 0) + i.quantity);
  }

  const byLocation = facilities
    .map((f) => ({ facility: f, units: perLocation.get(f.id) ?? 0, isReserve: f.alert_on_withdrawal }))
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units - a.units);

  return {
    totalUnits: consignmentUnits + loanerUnits,
    consignmentUnits,
    loanerUnits,
    byLocation,
  };
}

export function buildDayReadiness(
  date: string,
  cases: CaseRow[],
  catalogItems: CatalogItem[],
  inventory: InventoryItem[],
  facilities: Facility[],
): DayReadiness {
  const scheduled = cases.filter((c) => c.status === "scheduled" && c.surgery_date === date);
  const facilityById = new Map(facilities.map((f) => [f.id, f]));
  const reserveIds = new Set(facilities.filter((f) => f.alert_on_withdrawal).map((f) => f.id));

  // Cases per (joint, side) — a case needs one of every size on its side.
  function caseCount(joint: string, side: Side | "NA"): number {
    return scheduled.filter((c) => {
      if (c.surgery_type !== joint) return false;
      if (side === "NA") return true;
      return c.side === side;
    }).length;
  }

  const leftCases = scheduled.filter((c) => c.side === "LEFT").length;
  const rightCases = scheduled.filter((c) => c.side === "RIGHT").length;

  // Availability per catalog item, split by source and location.
  const availByCatalog = new Map<
    string,
    { total: number; reserve: number; consignment: number; loaner: number; byLoc: Map<string, number> }
  >();
  for (const i of inventory) {
    if (!i.catalog_item_id || isLoanerContainer(i)) continue;
    const a =
      availByCatalog.get(i.catalog_item_id) ??
      { total: 0, reserve: 0, consignment: 0, loaner: 0, byLoc: new Map<string, number>() };
    a.total += i.quantity;
    if (reserveIds.has(i.location_id)) a.reserve += i.quantity;
    if (i.acquisition_type === "loaner") a.loaner += i.quantity;
    else a.consignment += i.quantity;
    a.byLoc.set(i.location_id, (a.byLoc.get(i.location_id) ?? 0) + i.quantity);
    availByCatalog.set(i.catalog_item_id, a);
  }

  // Only sized implants drive the "every size" demand.
  const sized = catalogItems.filter((c) => c.category === "implant" && c.size_label);

  const sectionMap = new Map<string, ReadinessSection>();

  for (const item of sized) {
    const side: Side | "NA" = item.side === "LEFT" || item.side === "RIGHT" ? item.side : "NA";
    const joint = item.joint ?? "KNEE";
    const demand = caseCount(joint, side);
    if (demand === 0) continue; // no cases on this side today → not part of today's check

    const a =
      availByCatalog.get(item.id) ??
      { total: 0, reserve: 0, consignment: 0, loaner: 0, byLoc: new Map<string, number>() };
    const comfortableAvail = a.total - a.reserve;

    let status: ItemStatus;
    if (comfortableAvail >= demand) status = "ready";
    else if (a.total >= demand) status = "reserve";
    else status = "short";

    const needFromReserve = Math.max(0, Math.min(demand, a.total) - comfortableAvail);
    const needToOrder = Math.max(0, demand - a.total);

    const byLocation = [...a.byLoc.entries()]
      .map(([id, quantity]) => ({ facility: facilityById.get(id)!, quantity }))
      .filter((r) => r.facility)
      .sort((x, y) => x.facility.sourcing_priority - y.facility.sourcing_priority);

    const line: ReadinessLine = {
      catalogItem: item,
      demand,
      totalAvail: a.total,
      comfortableAvail,
      reserveAvail: a.reserve,
      consignmentAvail: a.consignment,
      loanerAvail: a.loaner,
      status,
      needFromReserve,
      needToOrder,
      byLocation,
    };

    const deviceType = item.device_type ?? "Other";
    const key = `${deviceType}|${side}`;
    const section =
      sectionMap.get(key) ??
      { key, deviceType, side, demandPerSize: demand, lines: [], sizesReady: 0, sizesReserve: 0, sizesShort: 0 };
    section.lines.push(line);
    if (status === "ready") section.sizesReady++;
    else if (status === "reserve") section.sizesReserve++;
    else section.sizesShort++;
    sectionMap.set(key, section);
  }

  const sections = [...sectionMap.values()].sort((a, b) => {
    // Sections with problems first, then alphabetical.
    const aBad = a.sizesShort * 2 + a.sizesReserve;
    const bBad = b.sizesShort * 2 + b.sizesReserve;
    if (aBad !== bBad) return bBad - aBad;
    return a.key.localeCompare(b.key);
  });
  for (const s of sections) {
    s.lines.sort((a, b) => (a.catalogItem.size_label ?? "").localeCompare(b.catalogItem.size_label ?? "", undefined, { numeric: true }));
  }

  let worst: ItemStatus | "none" = "none";
  for (const s of sections) {
    for (const l of s.lines) {
      if (worst === "none" || STATUS_RANK[l.status] > STATUS_RANK[worst]) worst = l.status;
    }
  }

  return {
    date,
    leftCases,
    rightCases,
    totalCases: scheduled.length,
    sections,
    worstStatus: worst,
    summary: buildInventorySummary(inventory, facilities),
  };
}

/**
 * Plain-language sourcing recommendation for a shortfall line: the order the
 * rep should try to cover it. Owned non-reserve locations first, then order a
 * loaner, and Lodi reserve only as the true last resort.
 */
export function sourcingAdvice(line: ReadinessLine, facilities: Facility[]): string {
  if (line.status === "ready") return "";

  const nonReserve = facilities
    .filter((f) => !f.alert_on_withdrawal)
    .sort((a, b) => a.sourcing_priority - b.sourcing_priority);

  // Which owned non-reserve locations actually hold this item (could be hauled).
  const holders = line.byLocation.filter((b) => !b.facility.alert_on_withdrawal);

  if (line.status === "reserve") {
    return `Covered, but ${line.needFromReserve} would come from Lodi Reserve — replenish after pulling.`;
  }

  // short: needToOrder units aren't anywhere in owned stock (even Lodi).
  const parts: string[] = [];
  if (holders.length > 0) {
    const names = holders.map((h) => `${h.facility.name} (${h.quantity})`).join(", ");
    parts.push(`Have some at ${names} — haul what you can.`);
  }
  parts.push(`Order a loaner for ${line.needToOrder}.`);
  if (line.reserveAvail > 0) {
    parts.push(`Lodi has ${line.reserveAvail} as an absolute last resort.`);
  } else if (nonReserve.length > 0 && holders.length === 0) {
    parts.push(`None in ${nonReserve.map((f) => f.name).join(" / ")}.`);
  }
  return parts.join(" ");
}
