export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next Wednesday from today (or today itself if today is Wednesday). */
export function nextWednesday(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 0 = Sun ... 3 = Wed
  const delta = (3 - day + 7) % 7;
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

/** Sunday of the week containing the given ISO date (or today). */
export function weekStart(iso?: string): string {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** The 7 ISO dates (Sun..Sat) for the week starting at weekStartISO. */
export function weekDays(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i));
}

export function formatWeekRange(weekStartISO: string): string {
  const start = new Date(`${weekStartISO}T00:00:00`);
  const end = new Date(`${addDays(weekStartISO, 6)}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

export function isToday(iso: string): boolean {
  return iso === toISODate(new Date());
}

export function tomorrow(): string {
  return addDays(toISODate(new Date()), 1);
}

/** Formats a "HH:MM" or "HH:MM:SS" time string as e.g. "7:30 AM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Formats a full timestamptz (e.g. movements.created_at) as local "7:42 AM". */
export function formatTimeOfDay(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today" / "Yesterday" / "Tue, Jul 14" for a full timestamptz. */
export function formatRelativeDay(isoTimestamp: string): string {
  const day = toISODate(new Date(isoTimestamp));
  const today = toISODate(new Date());
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDateShort(day);
}

export function monthAnchor(iso?: string): string {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonths(anchorISO: string, delta: number): string {
  const d = new Date(`${anchorISO}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return monthAnchor(toISODate(d));
}

export function monthLabel(anchorISO: string): string {
  return new Date(`${anchorISO}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** All grid days for a month view: Sunday on/before the 1st through Saturday
 * on/after the last day. Always full weeks. */
export function monthGridDays(anchorISO: string): string[] {
  const first = new Date(`${anchorISO}T00:00:00`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
