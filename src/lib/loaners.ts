import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "./types";
import { caseLabel } from "./staging";
import { addDays, formatDateShort } from "../utils/dates";

export type Urgency = "overdue" | "urgent" | "soon" | "extended";

export interface UpcomingNeed {
  caseRow: CaseRow;
  label: string;
}

export interface SwapSuggestion {
  type: "swap";
  need: UpcomingNeed;
  alternate: InventoryItem;
  suggestedUntil: string;
  suggestedReason: string;
}

export interface ExtendOnlySuggestion {
  type: "extend_only";
  need: UpcomingNeed;
  suggestedUntil: string;
  suggestedReason: string;
}

export type Suggestion = SwapSuggestion | ExtendOnlySuggestion | null;

export interface LoanerStatus {
  item: InventoryItem;
  facility: Facility;
  effectiveDeadline: string;
  daysLeft: number;
  extended: boolean;
  urgency: Urgency;
  suggestion: Suggestion;
}

/**
 * Builds the loaner return countdown: every loaner kit out in the field
 * with a return clock running, sorted most-urgent-first. Your rule is 48
 * hours after the case it was used on, unless extended — this only reads
 * the deadline already stamped by markLoanerUsed()/extendLoanerReturn(),
 * it doesn't compute the 48-hour math itself.
 *
 * Also flags a logistics suggestion when a loaner nearing its deadline is
 * needed again by a case in the next few days: extend it, and — if another
 * unit of the same kit exists that isn't itself needed soon — ship that
 * one back instead so you stay compliant without leaving the upcoming case
 * short.
 */
export function buildLoanerReport(
  inventory: InventoryItem[],
  cases: CaseRow[],
  templates: CaseTemplateWithItems[],
  facilities: Facility[],
  daysUntilFn: (iso: string) => number,
  today: string,
  lookaheadDays = 3,
): LoanerStatus[] {
  const corporate = facilities.find((f) => f.type === "corporate");
  const isFielded = (i: InventoryItem) => !corporate || i.location_id !== corporate.id;

  const loaners = inventory.filter(
    (i) => i.category === "loaner_kit" && (i.loaner_return_deadline || i.return_extended_until) && isFielded(i),
  );

  const horizonEnd = addDays(today, lookaheadDays);
  const upcomingCases = cases.filter(
    (c) => c.status === "scheduled" && c.surgery_date >= today && c.surgery_date <= horizonEnd,
  );

  function findUpcomingNeed(name: string): UpcomingNeed | null {
    for (const c of upcomingCases) {
      if (c.surgery_type === "INSTRUMENT") continue;
      const template = templates.find(
        (t) => t.surgery_type === c.surgery_type && t.variant === (c.variant ?? "total"),
      );
      if (!template) continue;
      const needsIt = template.case_template_items.some(
        (i) => i.category === "loaner_kit" && i.name === name,
      );
      if (needsIt) return { caseRow: c, label: caseLabel(c) };
    }
    return null;
  }

  return loaners
    .map((item) => {
      const facility = facilities.find((f) => f.id === item.location_id);
      const extended = Boolean(item.return_extended_until);
      const effectiveDeadline = item.return_extended_until ?? item.loaner_return_deadline!;
      const daysLeft = daysUntilFn(effectiveDeadline);
      const urgency: Urgency = extended
        ? "extended"
        : daysLeft < 0
          ? "overdue"
          : daysLeft <= 1
            ? "urgent"
            : "soon";

      let suggestion: Suggestion = null;
      if (!extended) {
        const need = findUpcomingNeed(item.name);
        if (need) {
          const suggestedUntil = addDays(need.caseRow.surgery_date, 1);
          const suggestedReason = `Needed for ${need.label} on ${formatDateShort(need.caseRow.surgery_date)}`;
          const alternate = inventory.find(
            (i) => i.id !== item.id && i.category === "loaner_kit" && i.name === item.name && isFielded(i),
          );
          suggestion = alternate
            ? { type: "swap", need, alternate, suggestedUntil, suggestedReason }
            : { type: "extend_only", need, suggestedUntil, suggestedReason };
        }
      }

      return { item, facility, effectiveDeadline, daysLeft, extended, urgency, suggestion };
    })
    .filter((s): s is LoanerStatus => Boolean(s.facility))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
