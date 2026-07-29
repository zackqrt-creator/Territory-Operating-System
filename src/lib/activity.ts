import type { CaseRow, Facility, InventoryItem, Movement, Profile } from "./types";
import { caseLabel } from "./staging";
import { formatDateShort } from "../utils/dates";

export interface ActivityEntry {
  id: string;
  icon: string;
  text: string;
  createdAt: string;
  /** True for a withdrawal from a reserve facility (e.g. Lodi) — render in red. */
  reserveAlert: boolean;
  movement: Movement;
}

/**
 * Turns raw movements rows into plain-language sentences, e.g. "Zack moved
 * GMK tray from Facility A to Vehicle." The `note` field is only used to
 * tell apart the three kinds of same-location movement our own code writes
 * (used-in-case vs. extended-return) — everything else (names, dates,
 * reasons) comes from the live joined records so the feed stays accurate
 * even if an item was renamed or an extension was later changed.
 */
export function buildActivityFeed(
  movements: Movement[],
  inventory: InventoryItem[],
  facilities: Facility[],
  profiles: Profile[],
  cases: CaseRow[],
): ActivityEntry[] {
  return movements.map((m) => {
    const item = inventory.find((i) => i.id === m.item_id);
    const itemName = item?.name ?? "an item";
    const moverName = profiles.find((p) => p.id === m.moved_by)?.display_name ?? "Someone";
    const fromFacility = facilities.find((f) => f.id === m.from_location);
    const toFacility = facilities.find((f) => f.id === m.to_location);
    const relatedCase = m.related_case_id ? cases.find((c) => c.id === m.related_case_id) : undefined;
    const caseText = relatedCase ? caseLabel(relatedCase) : "a case";

    let icon = "📦";
    let text: string;
    const reserveAlert = m.from_location !== m.to_location && Boolean(fromFacility?.alert_on_withdrawal);

    if (!m.from_location) {
      // No origin means it arrived from Medacta rather than moving between our
      // own locations -- a restock or an intake, not a transfer.
      icon = "📥";
      const shipment = m.note?.match(/Restocked\s+(\S+)/)?.[1];
      text = `${moverName} restocked ${itemName} at ${toFacility?.name ?? "a location"}${
        shipment ? ` — ${shipment}` : ""
      }`;
    } else if (m.from_location !== m.to_location) {
      icon = reserveAlert ? "🚨" : "📦";
      text = `${moverName} moved ${itemName} from ${fromFacility?.name ?? "somewhere"} to ${toFacility?.name ?? "somewhere"}`;
    } else if (m.note?.startsWith("Extended")) {
      icon = "🕐";
      const until = item?.return_extended_until ? formatDateShort(item.return_extended_until) : "later";
      text = item?.return_extension_reason
        ? `${moverName} extended ${itemName}'s return to ${until} — ${item.return_extension_reason}`
        : `${moverName} extended ${itemName}'s return to ${until}`;
    } else if (m.note?.startsWith("Used")) {
      icon = "🔧";
      if (item?.category === "loaner_kit") {
        const due = item.loaner_return_deadline ? formatDateShort(item.loaner_return_deadline) : null;
        text = `${moverName} used ${itemName} in ${caseText}${due ? ` — return due ${due}` : ""}`;
      } else {
        const qtyMatch = m.note.match(/Used (\d+)/);
        const qty = qtyMatch ? `${qtyMatch[1]}x ` : "";
        text = `${moverName} used ${qty}${itemName} in ${caseText}`;
      }
    } else {
      text = `${moverName} updated ${itemName}`;
    }

    return { id: m.id, icon, text, createdAt: m.created_at, reserveAlert, movement: m };
  });
}
