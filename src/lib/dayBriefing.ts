import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "./types";
import { computeReadiness } from "./readiness";
import { caseLabel } from "./staging";

/**
 * Answers "are we set up for <day>" the same way a rep would check by hand —
 * by running every case that day through the readiness engine and reading
 * off what it already knows. No model call, no judgment, no chance of
 * inventing a gap that isn't real: every line here traces back to a
 * case_template requirement and a live inventory count.
 */

export interface BriefingGap {
  caseLabel: string;
  facilityName: string;
  text: string;
}

export interface DayBriefing {
  date: string;
  label: string;
  caseCount: number;
  ready: boolean;
  gaps: BriefingGap[];
}

export function buildDayBriefing(
  date: string,
  label: string,
  cases: CaseRow[],
  templates: CaseTemplateWithItems[],
  inventory: InventoryItem[],
  facilities: Facility[],
): DayBriefing {
  const dayCases = cases.filter((c) => c.surgery_date === date && c.status !== "cancelled");
  const gaps: BriefingGap[] = [];

  for (const c of dayCases) {
    const readiness = computeReadiness(c, templates, inventory, facilities);
    if (!readiness.applicable) continue;
    const facility = facilities.find((f) => f.id === c.facility_id);
    const facilityName = facility?.name ?? "an unknown facility";
    for (const item of readiness.items) {
      if (item.status === "ready") continue;
      const text =
        item.status === "missing"
          ? `bring ${item.name} — not found in inventory anywhere`
          : `bring ${item.name}, currently at ${item.elsewhere[0].facility.name}`;
      gaps.push({ caseLabel: caseLabel(c), facilityName, text });
    }
  }

  return { date, label, caseCount: dayCases.length, ready: gaps.length === 0, gaps };
}

/** The sentence-shaped answer, matching how a rep would actually be told. */
export function formatBriefingAnswer(b: DayBriefing): string {
  if (b.caseCount === 0) {
    return `Nothing scheduled for ${b.label}.`;
  }
  if (b.ready) {
    return `Yes — all set for ${b.label}. ${b.caseCount} case${b.caseCount === 1 ? "" : "s"} checked, nothing missing.`;
  }
  const lines = b.gaps.map((g) => `• ${g.caseLabel} at ${g.facilityName} — ${g.text}`);
  return `Not quite — ${b.gaps.length} thing${b.gaps.length === 1 ? "" : "s"} to handle for ${b.label}:\n${lines.join("\n")}`;
}
