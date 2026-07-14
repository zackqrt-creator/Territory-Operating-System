import type {
  CaseRow,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  ItemCategory,
} from "./types";

export type ReadinessStatus = "ready" | "gap" | "missing";

export interface ElsewhereMatch {
  facility: Facility;
  items: InventoryItem[];
  quantity: number;
}

export interface ReadinessItem {
  category: ItemCategory;
  name: string;
  requiredQty: number;
  availableAtCaseFacility: number;
  elsewhere: ElsewhereMatch[];
  status: ReadinessStatus;
}

export interface CaseReadiness {
  applicable: boolean; // false for INSTRUMENT cases / cases with no matching template
  templateName: string | null;
  items: ReadinessItem[];
  overallStatus: ReadinessStatus | "n/a";
}

/**
 * Matches a case to its case_template (by surgery_type + variant) and diffs
 * the template's required items against live inventory at the case's
 * facility. Gap items point to which other facility currently holds stock,
 * mirroring the "GMK tray is at Facility B, case is at Facility A" flag from
 * the brief.
 */
export function computeReadiness(
  caseRow: CaseRow,
  templates: CaseTemplateWithItems[],
  inventory: InventoryItem[],
  facilities: Facility[],
): CaseReadiness {
  if (caseRow.surgery_type === "INSTRUMENT" || !caseRow.facility_id) {
    return { applicable: false, templateName: null, items: [], overallStatus: "n/a" };
  }

  const variant = caseRow.variant ?? "total";
  const template = templates.find(
    (t) => t.surgery_type === caseRow.surgery_type && t.variant === variant,
  );
  if (!template) {
    return { applicable: false, templateName: null, items: [], overallStatus: "n/a" };
  }

  const items: ReadinessItem[] = template.case_template_items.map((req) => {
    const matches = inventory.filter((i) => i.category === req.category && i.name === req.name);
    const atCase = matches
      .filter((i) => i.location_id === caseRow.facility_id)
      .reduce((sum, i) => sum + i.quantity, 0);

    const elsewhereByFacility = new Map<string, InventoryItem[]>();
    for (const m of matches) {
      if (m.location_id === caseRow.facility_id) continue;
      const list = elsewhereByFacility.get(m.location_id) ?? [];
      list.push(m);
      elsewhereByFacility.set(m.location_id, list);
    }
    const elsewhere: ElsewhereMatch[] = [...elsewhereByFacility.entries()]
      .map(([facilityId, matchedItems]) => ({
        facility: facilities.find((f) => f.id === facilityId)!,
        items: matchedItems,
        quantity: matchedItems.reduce((sum, i) => sum + i.quantity, 0),
      }))
      .filter((m) => m.facility)
      .sort((a, b) => b.quantity - a.quantity);

    const status: ReadinessStatus =
      atCase >= req.quantity ? "ready" : elsewhere.length > 0 ? "gap" : "missing";

    return {
      category: req.category,
      name: req.name,
      requiredQty: req.quantity,
      availableAtCaseFacility: atCase,
      elsewhere,
      status,
    };
  });

  const overallStatus: ReadinessStatus = items.some((i) => i.status !== "ready")
    ? items.some((i) => i.status === "missing")
      ? "missing"
      : "gap"
    : "ready";

  return { applicable: true, templateName: template.name, items, overallStatus };
}

export function gapMessage(item: ReadinessItem, caseFacility: Facility | undefined): string {
  if (item.status === "missing") {
    return `${item.name} not found in inventory anywhere.`;
  }
  const best = item.elsewhere[0];
  return `${item.name} is at ${best.facility.name}, case is at ${caseFacility?.name ?? "unknown facility"}.`;
}
