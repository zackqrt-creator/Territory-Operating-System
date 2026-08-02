import { useEffect, useMemo, useState } from "react";
import { listFrequentCatalogItemIds } from "../lib/api";
import type { CatalogItem } from "../lib/types";

/**
 * Puts the ~60 REFs this territory actually touches in front of the ~931 that
 * exist on paper.
 *
 * The signal is real usage, not a curated list: every item ever stocked left an
 * inventory_items row carrying its catalog_item_id, so the counting is already
 * done and there is nothing for a rep to maintain or forget. Items never
 * stocked keep their existing order behind the ones that have been.
 *
 * Failing to load is not an error worth surfacing — the picker just falls back
 * to the plain catalog order, which is what it did before this existed.
 */
export function useFrequentCatalog(withinDays = 180) {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    listFrequentCatalogItemIds(withinDays)
      .then((ids) => live && setOrder(ids))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [withinDays]);

  const rank = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);

  return useMemo(
    () => ({
      /** True if this item has actually been stocked in the window. */
      isFrequent: (id: string) => rank.has(id),

      /** Most-used first, then everything else in the order it came. */
      sort: (items: CatalogItem[]): CatalogItem[] => {
        if (rank.size === 0) return items;
        const big = Number.MAX_SAFE_INTEGER;
        return [...items].sort(
          (a, b) => (rank.get(a.id) ?? big) - (rank.get(b.id) ?? big),
        );
      },

      /** The few worth showing as one-tap chips. Empty until usage exists. */
      top: (items: CatalogItem[], n = 6): CatalogItem[] =>
        rank.size === 0
          ? []
          : items
              .filter((c) => rank.has(c.id))
              .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
              .slice(0, n),
    }),
    [rank],
  );
}
