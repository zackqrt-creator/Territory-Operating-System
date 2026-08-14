/**
 * Tests for the daily report generators.
 *
 * Run with:  npm run test:report
 *
 * The point of most of these is not formatting, it is the privacy contract:
 * a manager receives exactly what the rep selected and nothing that happens to
 * be sitting next to it in the database. The leak test builds a report whose
 * rows carry ids, source links and an unselected photo, and asserts none of it
 * reaches the output.
 */
import {
  buildFullReport,
  buildTextMessageReport,
  textMessageSegments,
  isReportEmpty,
} from "../src/lib/dailyReport.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${extra ? `\n        ${extra}` : ""}`);
  }
};

const FACILITIES = [
  { id: "fac-1", territory_id: "t", name: "Sutter Tracy", type: "hospital", address: null, alert_on_withdrawal: false, sourcing_priority: 10 },
  { id: "fac-2", territory_id: "t", name: "Lodi Storage", type: "storage", address: null, alert_on_withdrawal: true, sourcing_priority: 90 },
];
const ctx = { facilities: FACILITIES, authorName: "Zack" };

const item = (over) => ({
  id: crypto.randomUUID(),
  territory_id: "terr-secret-id",
  report_id: "rep-1",
  section: "completed",
  position: 0,
  title: "Untitled",
  detail: null,
  status: null,
  category: null,
  next_action: null,
  expected_date: null,
  priority: null,
  location_id: null,
  quantity: null,
  occurred_at: null,
  planned_time: null,
  source_type: null,
  source_id: null,
  created_at: "2026-08-13T12:00:00Z",
  ...over,
});

const report = {
  id: "rep-1",
  territory_id: "terr-secret-id",
  author_id: "author-secret-id",
  report_date: "2026-08-13",
  area: "Stockton / Lodi",
  summary: "Two knees at Sutter Tracy, restocked the trunk, placed an efficiency tote.",
  important_notes: null,
  status: "draft",
  sent_at: null,
  sent_to: null,
  sent_method: null,
  acknowledged_at: null,
  acknowledgement_note: null,
  sent_snapshot: null,
  created_at: "2026-08-13T08:00:00Z",
  updated_at: "2026-08-13T18:00:00Z",
  items: [
    item({ section: "completed", position: 0, title: "Covered 2 TKA cases", location_id: "fac-1", category: "Case support", source_type: "case", source_id: "case-secret-id" }),
    item({ section: "completed", position: 1, title: "Trunk replenishment", category: "Replenishment", source_type: "task", source_id: "task-secret-id" }),
    item({ section: "equipment", position: 0, title: "KA One Complete tote", status: "complete", location_id: "fac-1" }),
    item({ section: "equipment", position: 1, title: "Revision tote #2", status: "needs_attention", detail: "Came back short one broach" }),
    item({ section: "outstanding", position: 0, title: "Replace missing broach", status: "in_progress", detail: "Awaiting corporate shipment", next_action: "Chase warehouse", expected_date: "2026-08-15" }),
    item({ section: "manager_request", position: 0, title: "Place one additional efficiency tote", status: "complete", quantity: 1, location_id: "fac-1", occurred_at: "2026-08-13T14:30:00Z", detail: "Additional tote placed as requested" }),
    item({ section: "tomorrow", position: 0, title: "Hip case at Sutter Tracy", location_id: "fac-1", planned_time: "first case", priority: "high" }),
    item({ section: "guidance", position: 0, title: "Efficiency totes — Sutter Tracy", location_id: "fac-1", detail: "Place 1 additional tote", next_action: "1 additional tote, or a different quantity?" }),
  ],
  photos: [
    { id: "p1", territory_id: "terr-secret-id", report_id: "rep-1", url: "https://storage.example/item-photos/secret-path-1.jpg", caption: "Efficiency tote placed", source_type: "task_photo", source_id: "photo-secret-id", position: 0, created_at: "2026-08-13T15:00:00Z" },
  ],
};

const full = buildFullReport(report, ctx);
const sms = buildTextMessageReport(report, ctx);

console.log("\nFull report content");
// Locale-agnostic on purpose: the app formats in the reader's locale, so
// asserting a day/month order would only encode the test machine's.
check(
  "has the spelled-out date",
  ["Thursday", "August", "13", "2026"].every((part) => full.includes(part)),
  full.split("\n")[1],
);
check("names the territory/area", full.includes("Stockton / Lodi"));
check("carries the summary", full.includes("restocked the trunk"));
check("renders every section heading present in the data", [
  "COMPLETED TODAY", "EQUIPMENT / INVENTORY STATUS", "OUTSTANDING ITEMS",
  "MANAGER REQUESTS / INSTRUCTIONS", "TOMORROW'S PLAN", "DECISIONS / GUIDANCE NEEDED",
].every((h) => full.includes(h)));
check("resolves a location id to its name", full.includes("Sutter Tracy") && !full.includes("fac-1"));
check("shows quantity on a manager request", full.includes("qty 1"));
check("shows status where the section calls for it", full.includes("Needs Attention"));
check("carries next action and expected date on outstanding work", full.includes("Next: Chase warehouse") && full.includes("Expected: Aug 15"));
check("frames guidance as a question to confirm", full.includes("Please confirm:"));
check("lists the chosen photo by its caption", full.includes("Efficiency tote placed"));

check(
  "does not repeat a location the title already names",
  !full.includes("Hip case at Sutter Tracy (Sutter Tracy"),
  full.split("\n").find((l) => l.includes("Hip case")) ?? "",
);

console.log("\nPrivacy contract");
const leaks = [
  ["territory id", "terr-secret-id"],
  ["author id", "author-secret-id"],
  ["case id", "case-secret-id"],
  ["task id", "task-secret-id"],
  ["photo row id", "photo-secret-id"],
  ["photo storage url", "storage.example"],
  ["report id", "rep-1"],
];
for (const [label, needle] of leaks) {
  check(`full report does not leak the ${label}`, !full.includes(needle), `found: ${needle}`);
  check(`text version does not leak the ${label}`, !sms.includes(needle), `found: ${needle}`);
}

console.log("\nEmpty sections are omitted, not printed blank");
const sparse = { ...report, items: report.items.filter((i) => i.section === "completed"), photos: [] };
const sparseOut = buildFullReport(sparse, ctx);
check("omits a section with no items", !sparseOut.includes("OUTSTANDING ITEMS"));
check("omits the photo block when nothing was selected", !sparseOut.includes("PHOTOS / DOCUMENTATION"));
check("still renders the section that has items", sparseOut.includes("COMPLETED TODAY"));

console.log("\nText-message version");
check("leads with a short dated header", sms.startsWith("Territory Update — Aug 13"));
check("keeps the bullets", sms.includes("• Covered 2 TKA cases"));
check("drops detail lines that only belong in the full version", !sms.includes("Awaiting corporate shipment"));
check("keeps questions, which are the point of sending it", sms.includes("Need Confirmation"));
check("is materially shorter than the full report", sms.length < full.length, `sms=${sms.length} full=${full.length}`);
check("reports its SMS segment count", textMessageSegments(sms) >= 1);

console.log("\nEmpty state");
check("a blank report reads as empty", isReportEmpty({ ...report, summary: null, important_notes: null, items: [], photos: [] }));
check("a report with one line does not", !isReportEmpty(report));

console.log(
  failures
    ? `\n${failures} FAILING\n`
    : `\nall green — ${full.split("\n").length}-line full report, ${sms.length}-char text version\n`,
);
process.exit(failures ? 1 : 0);
