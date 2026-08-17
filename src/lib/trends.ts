import type { CaseRow, Facility, InventoryItem, Movement, PersonalTask, Surgeon } from "./types";

/**
 * The business-intelligence layer: read-only reporting over data the app is
 * already writing as a byproduct of normal use — cases, movements, tasks.
 * Nothing here captures anything new; it only looks backward at what
 * consumeStickerUsage/consumeStickerUsage-via-ticket, case completion, and
 * task work have already logged.
 *
 * Deliberately excludes anything that would need a history table that
 * doesn't exist yet (readiness status over time, gap frequency by facility)
 * rather than faking a trend line off a single live snapshot.
 */

export interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

export function inRange(dateISO: string, range: DateRange): boolean {
  return dateISO >= range.start && dateISO <= range.end;
}

// ---- Case volume ---------------------------------------------------------

export interface VolumeRow<T> {
  subject: T | null;
  count: number;
}

export function caseVolumeByFacility(cases: CaseRow[], facilities: Facility[]): VolumeRow<Facility>[] {
  const counts = new Map<string | null, number>();
  for (const c of cases) counts.set(c.facility_id, (counts.get(c.facility_id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([facilityId, count]) => ({
      subject: facilities.find((f) => f.id === facilityId) ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function caseVolumeBySurgeon(cases: CaseRow[], surgeons: Surgeon[]): VolumeRow<Surgeon>[] {
  const counts = new Map<string | null, number>();
  for (const c of cases) counts.set(c.surgeon_id, (counts.get(c.surgeon_id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([surgeonId, count]) => ({
      subject: surgeons.find((s) => s.id === surgeonId) ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** One count per ISO week (the Monday it starts), oldest first — the shape
 * of case volume over the range, for a simple bar/sparkline. */
export function caseVolumeByWeek(cases: CaseRow[]): { weekStart: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const d = new Date(`${c.surgery_date}T00:00:00`);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    const weekStart = d.toISOString().slice(0, 10);
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }
  return [...counts.entries()].map(([weekStart, count]) => ({ weekStart, count })).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
}

// ---- What's actually moving -----------------------------------------------

const USED_NOTE = /^Used (\d+) in case \(([^)]+)\)/;

export interface UsedItemRow {
  itemId: string;
  name: string;
  unitsUsed: number;
  fromStickerSheet: number;
  fromDigitalTicket: number;
}

/**
 * What's actually being consumed, ranked by units — reads the movement notes
 * consumeStickerUsage stamps ("Used N in case (sticker sheet)" /
 * "(digital ticket)"), the same source both capture flows write to. This is
 * the one metric here backed by real transaction history rather than a
 * point-in-time count.
 */
export function topUsedItems(
  movements: Movement[],
  inventory: InventoryItem[],
  range: DateRange,
  limit = 15,
): UsedItemRow[] {
  const rows = new Map<string, UsedItemRow>();
  for (const m of movements) {
    if (!inRange(m.created_at.slice(0, 10), range)) continue;
    const match = m.note?.match(USED_NOTE);
    if (!match) continue;
    const qty = parseInt(match[1], 10);
    const source = match[2];
    const item = inventory.find((i) => i.id === m.item_id);
    const name = item?.name ?? "Unknown item";
    const existing = rows.get(m.item_id) ?? {
      itemId: m.item_id,
      name,
      unitsUsed: 0,
      fromStickerSheet: 0,
      fromDigitalTicket: 0,
    };
    existing.unitsUsed += qty;
    if (source === "sticker sheet") existing.fromStickerSheet += qty;
    if (source === "digital ticket") existing.fromDigitalTicket += qty;
    rows.set(m.item_id, existing);
  }
  return [...rows.values()].sort((a, b) => b.unitsUsed - a.unitsUsed).slice(0, limit);
}

// ---- Task throughput -------------------------------------------------------

export interface TaskStats {
  completed: number;
  open: number;
  overdue: number;
  /** Of completed tasks that had a due date, the share finished on or before it. */
  onTimeRate: number | null;
  /** Median days from creation to completion, for completed tasks. */
  medianTurnaroundDays: number | null;
}

export function taskStats(tasks: PersonalTask[], range: DateRange): TaskStats {
  const inWindow = tasks.filter((t) => inRange(t.created_at.slice(0, 10), range));
  const completed = inWindow.filter((t) => t.status === "done" && t.done_at);
  const open = inWindow.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10));

  const withDueDate = completed.filter((t) => t.due_date);
  const onTime = withDueDate.filter((t) => t.done_at!.slice(0, 10) <= t.due_date!);
  const onTimeRate = withDueDate.length > 0 ? onTime.length / withDueDate.length : null;

  const turnarounds = completed
    .map((t) => {
      const created = new Date(t.created_at).getTime();
      const done = new Date(t.done_at!).getTime();
      return (done - created) / 86_400_000;
    })
    .sort((a, b) => a - b);
  const medianTurnaroundDays =
    turnarounds.length > 0 ? turnarounds[Math.floor(turnarounds.length / 2)] : null;

  return {
    completed: completed.length,
    open: open.length,
    overdue: overdue.length,
    onTimeRate,
    medianTurnaroundDays,
  };
}

/** Replenish/reorder tasks specifically — the ones the ticket-import and
 * sticker-sheet flows raise automatically — split out because "did the
 * restock actually happen" is a different question from task throughput in
 * general. */
export function replenishTaskStats(tasks: PersonalTask[], range: DateRange): TaskStats {
  const replenishOnly = tasks.filter((t) => /^(Replenish|Reorder):/.test(t.title));
  return taskStats(replenishOnly, range);
}
