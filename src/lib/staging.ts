import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem, ItemCategory } from "./types";
import { computeReadiness } from "./readiness";
import { formatTime } from "../utils/dates";

export function caseLabel(c: CaseRow): string {
  const type = c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instrument";
  const side = c.side ? (c.side === "LEFT" ? " L" : " R") : "";
  const time = c.surgery_time ? `${formatTime(c.surgery_time)} ` : "";
  return `${time}${type}${side}`;
}

export interface HaulItem {
  category: ItemCategory;
  name: string;
  quantity: number;
  forCases: string[];
  /** A specific inventory row at the "from" facility to move as a quick action. */
  sampleItem: InventoryItem;
}

export interface HaulRoute {
  from: Facility;
  to: Facility;
  items: HaulItem[];
}

export interface MissingItem {
  category: ItemCategory;
  name: string;
  quantity: number;
  forCases: string[];
}

export interface LoanerReturn {
  item: InventoryItem;
  facility: Facility;
  daysLeft: number;
}

export interface StagingReport {
  date: string;
  cases: CaseRow[];
  routes: HaulRoute[];
  readyCount: number;
  missing: MissingItem[];
  loanerReturns: LoanerReturn[];
}

/**
 * Builds the Tuesday-style staging report for a given date: what to haul
 * from where to where so every case that day is ready, what's already
 * staged, what's missing entirely, and which loaner kits need to ship back
 * to corporate before they sit through the week.
 */
export function buildStagingReport(
  date: string,
  allCases: CaseRow[],
  templates: CaseTemplateWithItems[],
  inventory: InventoryItem[],
  facilities: Facility[],
  daysUntilFn: (iso: string) => number,
): StagingReport {
  const cases = allCases.filter((c) => c.surgery_date === date && c.status === "scheduled");

  const routeMap = new Map<string, HaulRoute>();
  const missingMap = new Map<string, MissingItem>();
  let readyCount = 0;

  for (const c of cases) {
    const caseFacility = facilities.find((f) => f.id === c.facility_id);
    const readiness = computeReadiness(c, templates, inventory, facilities);
    if (!readiness.applicable || !caseFacility) continue;

    for (const item of readiness.items) {
      if (item.status === "ready") {
        readyCount++;
        continue;
      }
      if (item.status === "missing") {
        const key = `${item.category}|${item.name}`;
        const existing = missingMap.get(key);
        if (existing) {
          existing.quantity += item.requiredQty - item.availableAtCaseFacility;
          existing.forCases.push(caseLabel(c));
        } else {
          missingMap.set(key, {
            category: item.category,
            name: item.name,
            quantity: item.requiredQty - item.availableAtCaseFacility,
            forCases: [caseLabel(c)],
          });
        }
        continue;
      }

      // gap: haul from the best-stocked other facility to this case's facility
      const from = item.elsewhere[0].facility;
      const routeKey = `${from.id}|${caseFacility.id}`;
      const route = routeMap.get(routeKey) ?? { from, to: caseFacility, items: [] };
      const itemKey = `${item.category}|${item.name}`;
      const existingItem = route.items.find((i) => `${i.category}|${i.name}` === itemKey);
      const shortfall = item.requiredQty - item.availableAtCaseFacility;
      if (existingItem) {
        existingItem.quantity += shortfall;
        existingItem.forCases.push(caseLabel(c));
      } else {
        route.items.push({
          category: item.category,
          name: item.name,
          quantity: shortfall,
          forCases: [caseLabel(c)],
          sampleItem: item.elsewhere[0].items[0],
        });
      }
      routeMap.set(routeKey, route);
    }
  }

  const corporate = facilities.find((f) => f.type === "corporate");
  const loanerReturns: LoanerReturn[] = inventory
    .filter(
      (i) =>
        i.category === "loaner_kit" &&
        (i.loaner_return_deadline || i.return_extended_until) &&
        (!corporate || i.location_id !== corporate.id) &&
        daysUntilFn(i.return_extended_until ?? i.loaner_return_deadline!) <= 7,
    )
    .map((i) => ({
      item: i,
      facility: facilities.find((f) => f.id === i.location_id)!,
      daysLeft: daysUntilFn(i.return_extended_until ?? i.loaner_return_deadline!),
    }))
    .filter((r) => r.facility)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    date,
    cases,
    routes: [...routeMap.values()],
    readyCount,
    missing: [...missingMap.values()],
    loanerReturns,
  };
}
