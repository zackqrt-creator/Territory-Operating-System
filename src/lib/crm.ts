import type {
  CaseReadiness,
} from "./readiness";
import type {
  CaseRow,
  Facility,
  FacilityCredential,
  InventoryItem,
  ItemCategory,
  Movement,
  Profile,
} from "./types";
import { daysUntil } from "../utils/dates";

// ---------------------------------------------------------------------------
// Case readiness score (red / yellow / green)
//
// Honesty rule: a check with no data behind it reports "untracked" and never
// moves the color — it neither fakes a green nor cries a false red. Only
// logged data participates.
// ---------------------------------------------------------------------------

export type ScoreColor = "green" | "yellow" | "red";
export type CheckStatus = "pass" | "warn" | "fail" | "untracked";

export interface ScoreCheck {
  key: "items" | "delivery";
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CaseScore {
  color: ScoreColor;
  checks: ScoreCheck[];
}

/*
 * Sterilization and rep certification were scored here and have been removed.
 * Both were "untracked" on essentially every case -- nobody logs tray
 * sterilization in this territory and certifications live in RepTrax, not
 * here -- so they contributed two permanent grey rows to every case panel and
 * taught the rep to skim past the list that also carries the real warnings.
 * A check nobody feeds is worse than no check.
 */
export function scoreCase(
  caseRow: CaseRow,
  itemReadiness: CaseReadiness,
  inventory: InventoryItem[],
): CaseScore {
  const checks: ScoreCheck[] = [];

  // 1. Required items (existing template diff engine).
  if (!itemReadiness.applicable) {
    checks.push({ key: "items", label: "Required items", status: "untracked", detail: "No template for this case type." });
  } else if (itemReadiness.overallStatus === "ready") {
    checks.push({ key: "items", label: "Required items", status: "pass", detail: "All required items at the case facility." });
  } else if (itemReadiness.overallStatus === "gap") {
    checks.push({ key: "items", label: "Required items", status: "warn", detail: "Some items are at another facility — haul needed." });
  } else {
    checks.push({ key: "items", label: "Required items", status: "fail", detail: "Required items missing from every location." });
  }

  const linked = inventory.filter((i) => i.assigned_case_id === caseRow.id);

  // 2. Loaner delivery (inbound loaners linked to this case).
  const loaners = linked.filter((i) => i.acquisition_type === "loaner" && i.delivery_status !== null);
  if (loaners.length === 0) {
    checks.push({ key: "delivery", label: "Loaner delivery", status: "untracked", detail: "No inbound loaner tracked for this case." });
  } else {
    const late = loaners.filter(
      (l) => l.delivery_status !== "delivered" && l.expected_delivery_date !== null && l.expected_delivery_date > caseRow.surgery_date,
    );
    const cuttingIt = loaners.filter(
      (l) => l.delivery_status === "in_transit" && l.expected_delivery_date === caseRow.surgery_date,
    );
    if (late.length > 0) {
      checks.push({ key: "delivery", label: "Loaner delivery", status: "fail", detail: "A loaner is due to arrive after the surgery date." });
    } else if (cuttingIt.length > 0) {
      checks.push({ key: "delivery", label: "Loaner delivery", status: "warn", detail: "A loaner arrives the day of surgery — tight." });
    } else {
      checks.push({ key: "delivery", label: "Loaner delivery", status: "pass", detail: "All tracked loaners delivered or on time." });
    }
  }

  const color: ScoreColor = checks.some((c) => c.status === "fail")
    ? "red"
    : checks.some((c) => c.status === "warn")
      ? "yellow"
      : "green";
  return { color, checks };
}

// ---------------------------------------------------------------------------
// Preference cards: what this surgeon actually used in past cases of the same
// procedure, derived from the usage audit trail (movements with "Used" notes).
// Two modes — most-frequent across history (default) and copy-most-recent.
// ---------------------------------------------------------------------------

export type SuggestionMode = "frequent" | "recent";

export interface SuggestedItem {
  name: string;
  category: ItemCategory;
  quantity: number;
  casesUsedIn: number;
}

export function buildPreferenceCard(
  surgeonId: string,
  surgeryType: "KNEE" | "HIP",
  variant: "total" | "partial",
  cases: CaseRow[],
  movements: Movement[],
  inventory: InventoryItem[],
  mode: SuggestionMode,
): SuggestedItem[] {
  const pastCases = cases
    .filter(
      (c) =>
        c.surgeon_id === surgeonId &&
        c.surgery_type === surgeryType &&
        (c.variant ?? "total") === variant &&
        c.status === "completed",
    )
    .sort((a, b) => b.surgery_date.localeCompare(a.surgery_date));
  if (pastCases.length === 0) return [];

  const itemById = new Map(inventory.map((i) => [i.id, i]));
  const usage = movements.filter(
    (m) => m.related_case_id && m.note?.startsWith("Used") && pastCases.some((c) => c.id === m.related_case_id),
  );

  // caseId -> (name|category -> qty)
  const perCase = new Map<string, Map<string, { name: string; category: ItemCategory; qty: number }>>();
  for (const m of usage) {
    const item = itemById.get(m.item_id);
    if (!item) continue; // item since deleted — can't name it honestly, skip
    const qtyMatch = m.note!.match(/^Used (\d+)/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const key = `${item.category}|${item.name}`;
    const caseMap = perCase.get(m.related_case_id!) ?? new Map();
    const prev = caseMap.get(key);
    caseMap.set(key, { name: item.name, category: item.category, qty: (prev?.qty ?? 0) + qty });
    perCase.set(m.related_case_id!, caseMap);
  }
  if (perCase.size === 0) return [];

  if (mode === "recent") {
    const recentId = pastCases.find((c) => perCase.has(c.id))?.id;
    if (!recentId) return [];
    return [...perCase.get(recentId)!.values()].map((v) => ({
      name: v.name,
      category: v.category,
      quantity: v.qty,
      casesUsedIn: 1,
    }));
  }

  // frequent: items used in >= half the logged cases, qty = most common amount (max seen, rounded down to mode-ish via max of min... keep simple: max qty across cases)
  const tally = new Map<string, { name: string; category: ItemCategory; count: number; maxQty: number }>();
  for (const caseMap of perCase.values()) {
    for (const [key, v] of caseMap) {
      const t = tally.get(key) ?? { name: v.name, category: v.category, count: 0, maxQty: 0 };
      t.count++;
      t.maxQty = Math.max(t.maxQty, v.qty);
      tally.set(key, t);
    }
  }
  const threshold = Math.max(1, Math.ceil(perCase.size / 2));
  return [...tally.values()]
    .filter((t) => t.count >= threshold)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((t) => ({ name: t.name, category: t.category, quantity: t.maxQty, casesUsedIn: t.count }));
}

// ---------------------------------------------------------------------------
// Credential door-check: facility credentials that expire before an upcoming
// case at that facility — catch it before you're turned away at the door.
// ---------------------------------------------------------------------------

export interface CredentialConflict {
  credential: FacilityCredential;
  facility: Facility;
  rep: Profile | undefined;
  firstAffectedCase: CaseRow;
}

export function credentialConflicts(
  credentials: FacilityCredential[],
  cases: CaseRow[],
  facilities: Facility[],
  profiles: Profile[],
  todayISO: string,
): CredentialConflict[] {
  const upcoming = cases.filter((c) => c.status === "scheduled" && c.surgery_date >= todayISO);
  const out: CredentialConflict[] = [];
  for (const cred of credentials) {
    const affected = upcoming
      .filter((c) => c.facility_id === cred.facility_id && c.surgery_date > cred.expires_on)
      .sort((a, b) => a.surgery_date.localeCompare(b.surgery_date));
    if (affected.length === 0) continue;
    const facility = facilities.find((f) => f.id === cred.facility_id);
    if (!facility) continue;
    out.push({
      credential: cred,
      facility,
      rep: profiles.find((p) => p.id === cred.profile_id),
      firstAffectedCase: affected[0],
    });
  }
  return out.sort((a, b) => a.credential.expires_on.localeCompare(b.credential.expires_on));
}

// ---------------------------------------------------------------------------
// Expiring-lot planner: implants expiring within 60 days matched to upcoming
// cases that could plausibly use them (same joint + side). Advisory only.
// ---------------------------------------------------------------------------

export interface LotSuggestion {
  item: InventoryItem;
  daysLeft: number;
  candidateCase: CaseRow | null;
}

export function expiringLotSuggestions(
  inventory: InventoryItem[],
  cases: CaseRow[],
  catalogJointOf: (catalogItemId: string | null) => { joint: string | null; side: string | null },
  todayISO: string,
): LotSuggestion[] {
  const upcoming = cases
    .filter((c) => c.status === "scheduled" && c.surgery_date >= todayISO)
    .sort((a, b) => a.surgery_date.localeCompare(b.surgery_date));

  return inventory
    .filter(
      (i) =>
        i.category === "implant" &&
        i.expiration_date !== null &&
        !i.loaner_code &&
        daysUntil(i.expiration_date) >= 0 &&
        daysUntil(i.expiration_date) <= 60,
    )
    .map((item) => {
      const { joint, side } = catalogJointOf(item.catalog_item_id);
      const candidateCase =
        upcoming.find(
          (c) =>
            (!joint || c.surgery_type === joint) &&
            (!side || side === "NA" || c.side === side) &&
            c.surgery_date <= item.expiration_date!,
        ) ?? null;
      return { item, daysLeft: daysUntil(item.expiration_date!), candidateCase };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
