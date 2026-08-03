import type {
  CaseRow,
  CaseTemplateWithItems,
  Facility,
  InventoryItem,
  ItemCategory,
} from "./types";

export type ReadinessStatus = "ready" | "gap" | "missing";

/**
 * Identifies a checklist line for manual check-off. Lines are computed from the
 * template on every render rather than stored, so this is the only stable
 * handle a mark can hold onto.
 */
export function checklistItemKey(category: ItemCategory, name: string): string {
  return `${category}|${name}`;
}

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
  /** Stable handle for this line, for manual check-off. */
  key: string;
  /**
   * True when a rep ticked this line by hand. The line reads ready, but the
   * distinction is preserved all the way to the UI: confirmed-by-a-person and
   * confirmed-by-counted-stock are not the same claim, and collapsing them is
   * how a checklist starts lying.
   */
  manuallyConfirmed: boolean;
  /** What inventory says on its own, ignoring any manual mark. */
  inventoryStatus: ReadinessStatus;
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
  /** Item keys the rep has ticked by hand for this case. */
  markedKeys: ReadonlySet<string> = new Set(),
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

  // A right knee does not need the left complete tote. Lines default to 'ANY'
  // in the database, so templates that never distinguished sides are unaffected.
  const applicableLines = template.case_template_items.filter(
    (req) =>
      (req.applies_to_side ?? "ANY") === "ANY" ||
      req.applies_to_side === caseRow.side ||
      // A case with no side recorded shows every line rather than silently
      // hiding half the haul -- an unanswered question, not an answered one.
      caseRow.side === null,
  );

  const items: ReadinessItem[] = applicableLines.map((req) => {
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

    const inventoryStatus: ReadinessStatus =
      atCase >= req.quantity ? "ready" : elsewhere.length > 0 ? "gap" : "missing";

    const key = checklistItemKey(req.category, req.name);
    const manuallyConfirmed = inventoryStatus !== "ready" && markedKeys.has(key);

    return {
      category: req.category,
      name: req.name,
      requiredQty: req.quantity,
      availableAtCaseFacility: atCase,
      elsewhere,
      status: manuallyConfirmed ? "ready" : inventoryStatus,
      key,
      manuallyConfirmed,
      inventoryStatus,
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
