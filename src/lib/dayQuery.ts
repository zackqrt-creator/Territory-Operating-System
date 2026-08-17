import { addDays, toISODate } from "../utils/dates";

/**
 * Turns "are we set up for Wednesday" into a date. Deliberately not an LLM
 * call — this is a fixed, small vocabulary (today/tomorrow/weekday
 * names/explicit dates) matched with plain regex, so it's free, instant, and
 * never hallucinates a day. Phase 2 (open-ended knowledge Q&A) is where an
 * actual model call belongs; a day lookup doesn't need one.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export interface ResolvedDay {
  date: string; // YYYY-MM-DD
  label: string; // "today", "Wednesday", "Aug 20"
}

export function resolveDayQuery(question: string, today = new Date()): ResolvedDay | null {
  const q = question.toLowerCase();
  const todayISO = toISODate(today);

  if (/\btoday\b/.test(q)) return { date: todayISO, label: "today" };
  if (/\btomorrow\b/.test(q)) return { date: addDays(todayISO, 1), label: "tomorrow" };

  const explicit = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (explicit) return { date: explicit[0], label: explicit[0] };

  const slash = q.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) {
    const year = todayISO.slice(0, 4);
    const date = `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
    return { date, label: date };
  }

  for (let i = 0; i < 7; i++) {
    const day = WEEKDAYS[i];
    const abbrev = day.slice(0, 3);
    if (new RegExp(`\\b${day}\\b`).test(q) || new RegExp(`\\b${abbrev}\\b`).test(q)) {
      const date = nextWeekday(todayISO, i, /\bnext\b/.test(q));
      return { date, label: day[0].toUpperCase() + day.slice(1) };
    }
  }

  if (/\bthis week\b/.test(q)) return { date: todayISO, label: "this week" };

  return null;
}

/**
 * The next date landing on weekday `target` (0=Sun..6=Sat), same-day
 * inclusive -- asking "are we set for Wednesday" ON Wednesday should mean
 * today, not seven days out. "next Wednesday" always skips ahead a full week
 * even if today already is one, since that's what "next" means when said out
 * loud.
 */
function nextWeekday(fromISO: string, target: number, forceNextWeek: boolean): string {
  const from = new Date(`${fromISO}T00:00:00`);
  const current = from.getDay();
  let delta = (target - current + 7) % 7;
  if (forceNextWeek && delta === 0) delta = 7;
  return addDays(fromISO, delta);
}
