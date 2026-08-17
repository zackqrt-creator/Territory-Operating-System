import type { EntityEvent } from "./types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface WeekdayCount {
  weekday: string;
  count: number;
}

export interface VerbCount {
  verb: string;
  count: number;
}

/**
 * The first pattern-detection pass over entity_events: pure frequency counts,
 * nothing inferred or modeled. This is deliberately the simplest thing that
 * could be called a "pattern" — proof that automation suggestions later have
 * real counted behavior to point at, not a summary a model made up. As more
 * write paths log events, these numbers get more meaningful without any
 * change here.
 */
export function eventsByWeekday(events: EntityEvent[]): WeekdayCount[] {
  const counts = new Array(7).fill(0);
  for (const e of events) counts[new Date(e.occurred_at).getDay()]++;
  return WEEKDAYS.map((weekday, i) => ({ weekday, count: counts[i] })).filter((w) => w.count > 0);
}

export function eventsByVerb(events: EntityEvent[]): VerbCount[] {
  const map = new Map<string, number>();
  for (const e of events) map.set(e.verb, (map.get(e.verb) ?? 0) + 1);
  return [...map.entries()].map(([verb, count]) => ({ verb, count })).sort((a, b) => b.count - a.count);
}

export function eventsByEntityType(events: EntityEvent[]): { entityType: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of events) map.set(e.entity_type, (map.get(e.entity_type) ?? 0) + 1);
  return [...map.entries()]
    .map(([entityType, count]) => ({ entityType, count }))
    .sort((a, b) => b.count - a.count);
}

/** The one-sentence takeaway, read straight off the log. */
export function describeBusiestPattern(events: EntityEvent[]): string | null {
  if (events.length === 0) return null;
  const byDay = [...eventsByWeekday(events)].sort((a, b) => b.count - a.count);
  const byVerb = eventsByVerb(events);
  if (byDay.length === 0 || byVerb.length === 0) return null;
  const day = byDay[0];
  const verb = byVerb[0];
  return `Busiest logged day: ${day.weekday} (${day.count} action${day.count === 1 ? "" : "s"}). Most common action: "${verb.verb.replace(/_/g, " ")}" (${verb.count}×).`;
}
