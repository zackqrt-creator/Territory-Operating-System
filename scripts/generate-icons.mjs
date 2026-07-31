/**
 * Rasterise public/brand/emblem.svg into the app icons.
 *
 * Replaces a hand-rolled PNG encoder that drew a generic white "+" on a blue
 * square, from back when this environment had no image toolchain. Chromium is
 * available now, so the home-screen icon can be the real emblem.
 *
 * Run by hand (`node scripts/generate-icons.mjs`) when the emblem changes, not
 * on every build -- it needs a browser, which the deploy environment has no
 * reason to carry. The PNGs are committed, so deploys stay a plain static
 * build.
 *
 * The emblem is navy on white, so the icons get a white field rather than a
 * transparent one: iOS composites a home-screen icon onto white anyway, and a
 * transparent PNG there leaves a muddy edge. At 76% of the canvas the artwork
 * stays inside the maskable safe zone, so one file serves both `any` and
 * `maskable` without a second cropped variant.
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/brand/emblem.svg"), "utf8");

const SIZES = [
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-180.png", size: 180 },
];

const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

mkdirSync(join(root, "public/icons"), { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });

for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center">
       <div style="width:76%;height:76%">${svg}</div>
     </body>`,
  );
  await page.waitForTimeout(150);
  writeFileSync(join(root, file), await page.screenshot());
  await page.close();
  console.log(`wrote ${file} (${size}x${size})`);
}

await browser.close();
