import type { CaseRow, Facility, Profile } from "./types";

/** Chronological order for a day's cases: timed cases first (earliest first),
 * TBA cases last. Ties keep facility grouping stable. */
export function orderCasesForDay(cases: CaseRow[]): CaseRow[] {
  return [...cases].sort((a, b) => {
    const at = a.time_tba || !a.surgery_time ? null : a.surgery_time;
    const bt = b.time_tba || !b.surgery_time ? null : b.surgery_time;
    if (at === null && bt === null) return (a.facility_id ?? "").localeCompare(b.facility_id ?? "");
    if (at === null) return 1;
    if (bt === null) return -1;
    if (at !== bt) return at.localeCompare(bt);
    return (a.facility_id ?? "").localeCompare(b.facility_id ?? "");
  });
}

/** Plain-language load warnings for one day's cases. Empty array = nothing to flag. */
export function dayLoadWarnings(cases: CaseRow[], facilities: Facility[]): string[] {
  if (cases.length === 0) return [];
  const warnings: string[] = [];
  const facName = (id: string | null) =>
    facilities.find((f) => f.id === id)?.name ?? "unknown facility";

  const facIds = new Set(cases.map((c) => c.facility_id).filter(Boolean));
  if (cases.length >= 3) {
    warnings.push(`Heavy day: ${cases.length} cases.`);
  }
  if (facIds.size >= 2) {
    warnings.push(`Cases at ${facIds.size} facilities — plan travel time between sites.`);
  }

  // Same start time at different facilities = a physical impossibility for one rep.
  const timed = cases.filter((c) => !c.time_tba && c.surgery_time);
  const byTime = new Map<string, CaseRow[]>();
  for (const c of timed) {
    const list = byTime.get(c.surgery_time!) ?? [];
    list.push(c);
    byTime.set(c.surgery_time!, list);
  }
  for (const [, group] of byTime) {
    const groupFacs = new Set(group.map((c) => c.facility_id));
    if (group.length > 1 && groupFacs.size > 1) {
      const names = [...groupFacs].map((id) => facName(id ?? null)).join(" and ");
      warnings.push(`Two cases start at the same time at ${names} — someone needs coverage.`);
    }
  }

  const tba = cases.filter((c) => c.time_tba || !c.surgery_time).length;
  if (tba > 0) {
    warnings.push(`${tba} case${tba > 1 ? "s" : ""} still TBA — confirm start time${tba > 1 ? "s" : ""}.`);
  }
  return warnings;
}

/** "SD" from "Sam Diaz"; falls back to first two letters of a single name. */
export function repInitials(profile: Profile | undefined): string {
  if (!profile?.display_name) return "?";
  const parts = profile.display_name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

/** The rep a case counts against: explicit assignment, else whoever created it. */
export function caseRepId(c: CaseRow): string | null {
  return c.assigned_rep_id ?? c.created_by;
}
