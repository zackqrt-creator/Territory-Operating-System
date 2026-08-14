import type {
  DailyReportFull,
  DailyReportItem,
  DailyReportItemStatus,
  DailyReportPhoto,
  DailyReportSection,
  Facility,
} from "./types";

/**
 * Turning a report into the thing that actually leaves the building.
 *
 * Two rules govern everything here.
 *
 * First: this file is the privacy boundary. It renders the report's own rows
 * and nothing else. It takes no session, reaches no table, and follows no
 * source_type back to the task or case a line came from -- so there is no path
 * by which an internal note, an unselected photo or a database id can end up in
 * a manager's inbox. If a future change needs more context in the output, it
 * gets copied onto the report row first, deliberately, by the rep.
 *
 * Second: a manager reads this on a phone, between other things. Sections with
 * nothing in them are omitted rather than printed empty, lines stay short, and
 * the answer to "what do you need from me" sits at the bottom where a reply
 * naturally starts.
 */

const SECTION_TITLES: Record<DailyReportSection, string> = {
  completed: "Completed Today",
  equipment: "Equipment / Inventory Status",
  outstanding: "Outstanding Items",
  manager_request: "Manager Requests / Instructions",
  tomorrow: "Tomorrow's Plan",
  guidance: "Decisions / Guidance Needed",
};

const STATUS_LABELS: Record<DailyReportItemStatus, string> = {
  complete: "Complete",
  in_progress: "In Progress",
  pending: "Pending",
  needs_attention: "Needs Attention",
};

export function statusLabel(status: DailyReportItemStatus | null | undefined): string | null {
  return status ? STATUS_LABELS[status] : null;
}

/** "Wednesday, 13 August 2026" — spelled out, because a report is read once. */
export function formatReportDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Aug 13" — for the text-message header, where every character counts. */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeOf(occurredAt: string | null): string | null {
  if (!occurredAt) return null;
  const t = new Date(occurredAt);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function itemsIn(report: DailyReportFull, section: DailyReportSection): DailyReportItem[] {
  return report.items
    .filter((i) => i.section === section)
    .sort((a, b) => a.position - b.position);
}

/**
 * One line of a section, with its qualifiers in brackets after the text.
 *
 * Location, quantity and time are appended rather than given their own lines
 * because a manager scanning twenty bullets reads the noun first; the detail
 * only matters once they have stopped on that line.
 */
function renderItem(
  item: DailyReportItem,
  facilityName: (id: string | null) => string | null,
  opts: { showStatus?: boolean; brief?: boolean } = {},
): string {
  const qualifiers: string[] = [];
  const place = facilityName(item.location_id);
  // Not when the rep already wrote it into the line. "Hip case at Sutter Tracy
  // (Sutter Tracy)" is the kind of detail that makes a report look generated.
  if (place && !item.title.toLowerCase().includes(place.toLowerCase())) qualifiers.push(place);
  if (item.quantity != null) qualifiers.push(`qty ${item.quantity}`);
  const at = timeOf(item.occurred_at);
  if (at) qualifiers.push(at);
  if (item.planned_time) qualifiers.push(item.planned_time);
  if (item.priority === "high") qualifiers.push("priority");

  let line = item.title.trim();
  if (qualifiers.length) line += ` (${qualifiers.join(", ")})`;
  if (opts.showStatus) {
    const label = statusLabel(item.status);
    if (label) line += ` — ${label}`;
  }
  if (opts.brief) return line;

  const extras: string[] = [];
  if (item.detail?.trim()) extras.push(item.detail.trim());
  if (item.next_action?.trim()) extras.push(`Next: ${item.next_action.trim()}`);
  if (item.expected_date) extras.push(`Expected: ${formatShortDate(item.expected_date)}`);
  return extras.length ? `${line}\n    ${extras.join(" · ")}` : line;
}

export interface ReportRenderContext {
  /** Facilities the rep can see, used only to turn a location id into a name. */
  facilities: Facility[];
  /** Shown under the title so a manager knows who sent it. */
  authorName?: string | null;
}

function facilityNamer(facilities: Facility[]) {
  const byId = new Map(facilities.map((f) => [f.id, f.name]));
  return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
}

/**
 * The full report: what gets copied into an email, printed, or saved as PDF.
 *
 * Plain text with headings rather than markdown, because it is pasted into mail
 * clients and message apps that render neither consistently.
 */
export function buildFullReport(report: DailyReportFull, ctx: ReportRenderContext): string {
  const name = facilityNamer(ctx.facilities);
  const out: string[] = [];

  out.push("TERRITORY OPERATIONS — DAILY UPDATE");
  out.push(`Date: ${formatReportDate(report.report_date)}`);
  if (report.area?.trim()) out.push(`Territory / area: ${report.area.trim()}`);
  if (ctx.authorName) out.push(`From: ${ctx.authorName}`);

  if (report.summary?.trim()) {
    out.push("", "DAILY SUMMARY", report.summary.trim());
  }

  const section = (
    key: DailyReportSection,
    opts: { showStatus?: boolean } = {},
  ): void => {
    const items = itemsIn(report, key);
    if (!items.length) return;
    out.push("", SECTION_TITLES[key].toUpperCase());
    for (const item of items) out.push(`  • ${renderItem(item, name, opts)}`);
  };

  section("completed");
  section("equipment", { showStatus: true });

  if (report.photos.length) {
    out.push("", "PHOTOS / DOCUMENTATION");
    report.photos
      .slice()
      .sort((a, b) => a.position - b.position)
      .forEach((p, i) => {
        out.push(`  ${i + 1}. ${p.caption?.trim() || "Photo"}`);
      });
    out.push("  (Photos attached separately.)");
  }

  section("outstanding", { showStatus: true });
  section("manager_request", { showStatus: true });
  section("tomorrow");

  const guidance = itemsIn(report, "guidance");
  if (guidance.length) {
    out.push("", SECTION_TITLES.guidance.toUpperCase());
    for (const item of guidance) {
      const place = name(item.location_id);
      out.push(`  • ${item.title.trim()}${place ? ` (${place})` : ""}`);
      if (item.detail?.trim()) out.push(`    Current plan: ${item.detail.trim()}`);
      if (item.next_action?.trim()) out.push(`    Please confirm: ${item.next_action.trim()}`);
    }
  }

  if (report.important_notes?.trim()) {
    out.push("", "IMPORTANT NOTES", report.important_notes.trim());
  }

  return out.join("\n").trim() + "\n";
}

/**
 * The condensed version, for a text message.
 *
 * Aggressively short: no detail lines, no next actions, no expected dates. A
 * manager who needs those can be sent the full version. Guidance still makes
 * the cut, because a question that never arrives never gets answered.
 */
export function buildTextMessageReport(
  report: DailyReportFull,
  ctx: ReportRenderContext,
): string {
  const name = facilityNamer(ctx.facilities);
  const out: string[] = [`Territory Update — ${formatShortDate(report.report_date)}`];

  const block = (heading: string, section: DailyReportSection, showStatus = false) => {
    const items = itemsIn(report, section);
    if (!items.length) return;
    out.push("", heading);
    for (const item of items) {
      out.push(`• ${renderItem(item, name, { brief: true, showStatus })}`);
    }
  };

  block("Completed", "completed");
  block("Equipment", "equipment", true);
  block("Outstanding", "outstanding", true);
  block("Manager Requests", "manager_request", true);
  block("Tomorrow", "tomorrow");

  const guidance = itemsIn(report, "guidance");
  if (guidance.length) {
    out.push("", "Need Confirmation");
    for (const item of guidance) out.push(`• ${item.title.trim()}`);
  }

  return out.join("\n").trim();
}

/**
 * Rough size of the text version in messages.
 *
 * A single SMS is 160 characters; anything with a non-GSM character drops to
 * 70. Reps hit this constantly and only find out when a carrier splits the
 * message, so the count is shown while there is still time to trim.
 */
export function textMessageSegments(text: string): number {
  const gsmSafe = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà•·—]*$/.test(
    text,
  );
  const limit = gsmSafe ? 160 : 70;
  const perSegment = gsmSafe ? 153 : 67;
  return text.length <= limit ? 1 : Math.ceil(text.length / perSegment);
}

/** Everything a rep can send, generated together so the two never disagree. */
export function generateReportOutputs(report: DailyReportFull, ctx: ReportRenderContext) {
  return {
    full: buildFullReport(report, ctx),
    textMessage: buildTextMessageReport(report, ctx),
  };
}

/** True when there is nothing worth sending yet — drives the empty state. */
export function isReportEmpty(report: DailyReportFull): boolean {
  return (
    !report.summary?.trim() &&
    !report.important_notes?.trim() &&
    report.items.length === 0 &&
    report.photos.length === 0
  );
}

export function sectionTitle(section: DailyReportSection): string {
  return SECTION_TITLES[section];
}

/** Photos in the order they will appear in the generated report. */
export function orderedPhotos(report: DailyReportFull): DailyReportPhoto[] {
  return report.photos.slice().sort((a, b) => a.position - b.position);
}
