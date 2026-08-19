import type {
  CaseRow,
  CaseTemplateWithItems,
  DayRequirement,
  Facility,
  InventoryItem,
  ItemCategory,
} from "./types";
import { checklistItemKey, computeReadiness } from "./readiness";
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

/**
 * A line that goes in the car once for the whole day, however many cases are
 * on it. Deliberately not folded into the per-case haul: counting the revision
 * totes once per knee would ask a three-knee Tuesday for six of them.
 */
export interface DayHaulItem {
  /** `category|name`, matching checklistItemKey(). */
  key: string;
  category: ItemCategory;
  name: string;
  quantity: number;
  note: string | null;
  /** Everywhere the app can see one, best-stocked first. Empty means nowhere on record. */
  locations: { facility: Facility; count: number }[];
  manuallyConfirmed: boolean;
}

export interface StagingReport {
  date: string;
  cases: CaseRow[];
  routes: HaulRoute[];
  readyCount: number;
  missing: MissingItem[];
  loanerReturns: LoanerReturn[];
  /** Empty when nothing is scheduled, or before migration 051 has run. */
  dayItems: DayHaulItem[];
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
  /** What goes in the car on any day of this kind. Empty is a valid, quiet state. */
  dayRequirements: DayRequirement[] = [],
  /** Day lines the rep has ticked by hand for this date. */
  dayMarkedKeys: ReadonlySet<string> = new Set(),
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

  // Day-level lines. A requirement applies if the day has at least one case of
  // its kind, or if it is marked 'ANY', in which case any scheduled case
  // triggers it. No cases, no day list: there is nothing to bring.
  const kindsToday = new Set(cases.map((c) => c.surgery_type));

  // Per-side case counts, for 'per_side_plus_one' requirements -- "how many
  // rights today" is a different question from "is there a knee day", and
  // needs its own tally rather than the flat kindsToday set.
  const sideCounts = new Map<string, number>();
  for (const c of cases) {
    if (!c.side) continue;
    const key = `${c.surgery_type}|${c.side}`;
    sideCounts.set(key, (sideCounts.get(key) ?? 0) + 1);
  }
  const ALL_SURGERY_TYPES = ["KNEE", "HIP", "INSTRUMENT"] as const;

  function locationsFor(category: ItemCategory, name: string) {
    const byFacility = new Map<string, number>();
    for (const i of inventory) {
      if (i.category !== category || i.name !== name) continue;
      byFacility.set(i.location_id, (byFacility.get(i.location_id) ?? 0) + i.quantity);
    }
    return [...byFacility.entries()]
      .map(([facilityId, count]) => ({
        facility: facilities.find((f) => f.id === facilityId)!,
        count,
      }))
      .filter((l) => l.facility)
      .sort((a, b) => b.count - a.count);
  }

  const dayItems: DayHaulItem[] =
    cases.length === 0
      ? []
      : dayRequirements
          .filter((r) => r.surgery_type === "ANY" || kindsToday.has(r.surgery_type))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
          .flatMap((r): DayHaulItem[] => {
            if (r.scaling === "per_side_plus_one") {
              const matchTypes: readonly (typeof ALL_SURGERY_TYPES)[number][] =
                r.surgery_type === "ANY" ? ALL_SURGERY_TYPES : [r.surgery_type];
              return (["RIGHT", "LEFT"] as const)
                .map((side) => {
                  const count = matchTypes.reduce(
                    (sum, t) => sum + (sideCounts.get(`${t}|${side}`) ?? 0),
                    0,
                  );
                  // No cases on that side today: nothing to buffer for, so no line.
                  if (count === 0) return null;
                  const name = `${r.name} (${side === "RIGHT" ? "Right" : "Left"})`;
                  const key = checklistItemKey(r.category, name);
                  return {
                    key,
                    category: r.category,
                    name,
                    quantity: count + r.quantity,
                    note: r.note,
                    locations: locationsFor(r.category, name),
                    manuallyConfirmed: dayMarkedKeys.has(key),
                  };
                })
                .filter((item): item is DayHaulItem => item !== null);
            }

            const key = checklistItemKey(r.category, r.name);
            return [
              {
                key,
                category: r.category,
                name: r.name,
                quantity: r.quantity,
                note: r.note,
                locations: locationsFor(r.category, r.name),
                manuallyConfirmed: dayMarkedKeys.has(key),
              },
            ];
          });

  return {
    date,
    cases,
    routes: [...routeMap.values()],
    readyCount,
    missing: [...missingMap.values()],
    loanerReturns,
    dayItems,
  };
}
