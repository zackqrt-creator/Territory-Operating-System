import type {
  CaseRow,
  CatalogItem,
  InventoryItem,
  Side,
  Surgeon,
  SurgeonPreference,
  SurgeryType,
  ToteTemplateWithItems,
} from "./types";

export type PackStatus = "ready" | "short" | "missing";

export interface PackLine {
  catalogItem: CatalogItem;
  requiredQty: number;
  onHandQty: number;
  matchedItems: InventoryItem[];
  status: PackStatus;
  /** Physical packing order, when the tote template defines one — null sorts last. */
  packLayer: number | null;
}

export interface InstrumentAdvice {
  toteTemplate: ToteTemplateWithItems;
  traysAvailable: number;
  recommendedTrays: number;
  text: string;
}

export interface PackGroup {
  key: string;
  surgeon: Surgeon | null;
  surgeryType: SurgeryType;
  side: Side;
  cases: CaseRow[];
  implantLines: PackLine[];
  instrumentAdvice: InstrumentAdvice[];
  unresolvedNote: string | null;
}

export interface PackList {
  groups: PackGroup[];
}

/**
 * Finds the same product/size/category on the opposite side. Tote
 * templates only need to be defined once (e.g. the Left version) — this
 * mirrors them for Right cases automatically, as long as a Right catalog
 * item with the same product_line/category/size_label exists. Side-neutral
 * items (screws, pins, shims — side "NA") pass through unchanged.
 */
function resolveForSide(item: CatalogItem, side: Side, catalog: CatalogItem[]): CatalogItem | null {
  if (item.side === "NA" || item.side === side) return item;
  return (
    catalog.find(
      (c) =>
        c.side === side &&
        c.category === item.category &&
        c.product_line === item.product_line &&
        c.size_label === item.size_label,
    ) ?? null
  );
}

function matchInventory(catalogItem: CatalogItem, inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter(
    (i) => i.catalog_item_id === catalogItem.id || (!i.catalog_item_id && i.name === catalogItem.name),
  );
}

/**
 * Builds the pack list for a set of cases: groups by surgeon + side +
 * surgery type, resolves each surgeon's preferred tote templates, and
 * expands them into exact required quantities — implants multiplied by
 * how many same-side cases need them that day (hard requirement, since an
 * opened implant can't go back on the shelf), instrument trays left at
 * their template quantity with a soft, non-blocking advisory based on how
 * many same-side cases they'll cover.
 */
export function buildPackList(
  cases: CaseRow[],
  surgeons: Surgeon[],
  preferences: SurgeonPreference[],
  toteTemplates: ToteTemplateWithItems[],
  inventory: InventoryItem[],
  catalogItems: CatalogItem[],
): PackList {
  const relevant = cases.filter(
    (c) => c.status === "scheduled" && (c.surgery_type === "KNEE" || c.surgery_type === "HIP") && c.side,
  );

  const groupMap = new Map<string, CaseRow[]>();
  for (const c of relevant) {
    const key = `${c.surgeon_id ?? "unmapped"}|${c.side}|${c.surgery_type}|${c.variant ?? "total"}`;
    const list = groupMap.get(key) ?? [];
    list.push(c);
    groupMap.set(key, list);
  }

  const groups: PackGroup[] = [...groupMap.entries()].map(([key, groupCases]) => {
    const sample = groupCases[0];
    const surgeon = sample.surgeon_id ? (surgeons.find((s) => s.id === sample.surgeon_id) ?? null) : null;
    const side = sample.side as Side;
    const caseCount = groupCases.length;

    if (!surgeon) {
      return {
        key,
        surgeon: null,
        surgeryType: sample.surgery_type,
        side,
        cases: groupCases,
        implantLines: [],
        instrumentAdvice: [],
        unresolvedNote: `${caseCount} case${caseCount === 1 ? "" : "s"} with no surgeon on file — add one on the case, or use the standard checklist on Calendar.`,
      };
    }

    const pref = preferences.find(
      (p) =>
        p.surgeon_id === surgeon.id &&
        p.surgery_type === sample.surgery_type &&
        p.variant === (sample.variant ?? "total"),
    );

    if (!pref) {
      return {
        key,
        surgeon,
        surgeryType: sample.surgery_type,
        side,
        cases: groupCases,
        implantLines: [],
        instrumentAdvice: [],
        unresolvedNote: `No preference profile set up yet for ${surgeon.name} — using the standard checklist on Calendar instead.`,
      };
    }

    const implantLineMap = new Map<string, PackLine>();
    const implantTote = pref.implant_tote_id
      ? toteTemplates.find((t) => t.id === pref.implant_tote_id)
      : null;
    if (implantTote) {
      for (const toteItem of implantTote.tote_template_items) {
        const resolved = resolveForSide(toteItem.catalog_item, side, catalogItems);
        if (!resolved) continue; // not yet catalogued for this side
        const required = toteItem.quantity_per_tote * caseCount;
        const existing = implantLineMap.get(resolved.id);
        if (existing) {
          existing.requiredQty += required;
        } else {
          const matched = matchInventory(resolved, inventory);
          const onHandQty = matched.reduce((sum, i) => sum + i.quantity, 0);
          implantLineMap.set(resolved.id, {
            catalogItem: resolved,
            requiredQty: required,
            onHandQty,
            matchedItems: matched,
            status: onHandQty >= required ? "ready" : onHandQty > 0 ? "short" : "missing",
            packLayer: toteItem.pack_layer,
          });
        }
      }
    }
    // Re-derive status now that quantities from repeated tote items are fully summed.
    for (const line of implantLineMap.values()) {
      line.status = line.onHandQty >= line.requiredQty ? "ready" : line.onHandQty > 0 ? "short" : "missing";
    }

    const instrumentAdvice: InstrumentAdvice[] = [];
    const instrumentTote = pref.instrument_tote_id
      ? toteTemplates.find((t) => t.id === pref.instrument_tote_id)
      : null;
    if (instrumentTote) {
      // All instrument-tray line items in this tote share the same tray count.
      const trayItem = instrumentTote.tote_template_items[0];
      const resolvedTray = trayItem ? resolveForSide(trayItem.catalog_item, side, catalogItems) : null;
      const traysAvailable = resolvedTray
        ? matchInventory(resolvedTray, inventory).reduce((sum, i) => sum + i.quantity, 0)
        : 0;

      if (instrumentTote.reusable) {
        const ratio = instrumentTote.advisory_cases_per_unit ?? 2;
        const recommendedTrays = Math.max(1, Math.ceil(caseCount / ratio));
        instrumentAdvice.push({
          toteTemplate: instrumentTote,
          traysAvailable,
          recommendedTrays,
          text:
            traysAvailable >= recommendedTrays
              ? `${traysAvailable} tray${traysAvailable === 1 ? "" : "s"} on hand for ${caseCount} case${caseCount === 1 ? "" : "s"} — should be fine with a normal turnaround between cases.`
              : `${traysAvailable} tray${traysAvailable === 1 ? "" : "s"} on hand for ${caseCount} case${caseCount === 1 ? "" : "s"} — recommend ${recommendedTrays} if cases run back-to-back without time to resterilize.`,
        });
      } else if (trayItem) {
        // Single-use instruments (e.g. plastic disposable sets) — hard per-case requirement.
        const required = caseCount;
        implantLineMap.set(`instrument:${instrumentTote.id}`, {
          catalogItem: resolvedTray ?? trayItem.catalog_item,
          requiredQty: required,
          onHandQty: traysAvailable,
          matchedItems: resolvedTray ? matchInventory(resolvedTray, inventory) : [],
          status: traysAvailable >= required ? "ready" : traysAvailable > 0 ? "short" : "missing",
          packLayer: trayItem.pack_layer,
        });
      }
    }

    const implantLines = [...implantLineMap.values()].sort((a, b) => {
      const layerDiff = (a.packLayer ?? 99) - (b.packLayer ?? 99);
      if (layerDiff !== 0) return layerDiff;
      return a.catalogItem.name.localeCompare(b.catalogItem.name) || (a.catalogItem.size_label ?? "").localeCompare(b.catalogItem.size_label ?? "");
    });

    return {
      key,
      surgeon,
      surgeryType: sample.surgery_type,
      side,
      cases: groupCases,
      implantLines,
      instrumentAdvice,
      unresolvedNote: null,
    };
  });

  groups.sort((a, b) => (a.surgeon?.name ?? "zzz").localeCompare(b.surgeon?.name ?? "zzz") || a.side.localeCompare(b.side));

  return { groups };
}
