/**
 * Runs scripts/livescan-probe.html in a real Chromium and reports its results.
 *
 * Run with:  npm run test:livescan
 *
 * The live scanner's whole premise is that a frame taken off a <video> at its
 * native size decodes where the old library's downscaled canvas could not.
 * That claim involves canvas, ImageData and the wasm together, so it cannot be
 * checked in node — hence a browser. The probe generates its own barcode with
 * the same library's writer, so there is no fixture to go stale.
 */
import { createServer } from "vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { port: 5199, strictPort: true },
  optimizeDeps: { include: [] },
});
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto("http://localhost:5199/scripts/livescan-probe.html");
await page.waitForFunction(() => window.__probeDone === true, null, { timeout: 120_000 });
const results = await page.evaluate(() => window.__probeResults);

console.log("\nlive scan pipeline (real Chromium)");
let failures = 0;
for (const r of results) {
  if (r.pass) {
    console.log(`  PASS  ${r.name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${r.name}${r.extra ? `\n        ${r.extra}` : ""}`);
  }
}
for (const e of consoleErrors) {
  failures++;
  console.log(`  FAIL  page error\n        ${e}`);
}

await browser.close();
await server.close();

console.log(failures === 0 ? "\nAll live-scan tests passed.\n" : `\n${failures} failing.\n`);
process.exit(failures === 0 ? 0 : 1);
