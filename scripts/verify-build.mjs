import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fails the build if the output does not contain the application.
 *
 * This exists because it already happened. Vite 8 / rolldown, paired with the
 * plugin versions this project had, emitted every dependency and *none* of
 * `src/` -- a 395 KiB bundle of React, Supabase and lucide that renders a blank
 * page. `vite build` reported success, `tsc` was clean, and the deploys went
 * out green. Nobody noticed for days, because the installed PWA's service
 * worker kept serving an older cached build that still worked.
 *
 * A bundle that builds, deploys, and reports success while containing no
 * application is the worst kind of failure: silent and downstream. So the build
 * now proves the app is in it.
 */

const ASSETS = "dist/assets";

/** Strings that only this application's own source can produce. */
const MARKERS = [
  "Territory", // app shell / nav
  "surgery_date", // the cases query
  "tote_template_items", // the Sets query
];

let files;
try {
  files = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
} catch {
  fail(`No ${ASSETS} directory. Did the build run?`);
}

if (files.length === 0) fail(`No JavaScript emitted into ${ASSETS}.`);

const bundle = files.map((f) => readFileSync(join(ASSETS, f), "utf8")).join("\n");
const missing = MARKERS.filter((m) => !bundle.includes(m));

if (missing.length > 0) {
  fail(
    `The bundle is missing application code.\n` +
      `  Absent markers: ${missing.join(", ")}\n` +
      `  Emitted ${files.length} file(s), ${(bundle.length / 1024).toFixed(0)} KiB total.\n\n` +
      `  This means the bundler dropped src/ while keeping node_modules.\n` +
      `  Check the vite / @vitejs/plugin-react versions against each other\n` +
      `  before shipping -- a mismatch has caused exactly this before.`,
  );
}

console.log(
  `Build verified: application present in ${files.length} chunk(s), ` +
    `${(bundle.length / 1024).toFixed(0)} KiB.`,
);

function fail(message) {
  console.error(`\nBuild verification FAILED\n  ${message}\n`);
  process.exit(1);
}
