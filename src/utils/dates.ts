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
