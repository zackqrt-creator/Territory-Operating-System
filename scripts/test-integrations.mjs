/**
 * Tests for the integration framework's declarations.
 *
 * These guard the two rules that make the framework trustworthy rather than
 * decorative:
 *
 *   1. Nothing claims to be connectable unless a connector actually exists.
 *   2. No credential value is ever named in client-side code -- only the NAME
 *      of a Supabase secret.
 *
 * Both are the kind of thing that decays quietly the first time someone adds a
 * provider in a hurry, which is exactly why they are asserted here.
 */
import { readFileSync } from "node:fs";
import { PROVIDERS, findProvider, canRun } from "../src/lib/integrations/registry.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${extra ? `\n        ${extra}` : ""}`);
  }
};

const edgeFn = readFileSync(
  new URL("../supabase/functions/integration-run/index.ts", import.meta.url),
  "utf8",
);

console.log("\nRegistry shape");
check("declares at least one provider", PROVIDERS.length > 0);
check(
  "every provider has a unique machine name",
  new Set(PROVIDERS.map((p) => p.provider)).size === PROVIDERS.length,
);
check(
  "every provider declares what it brings",
  PROVIDERS.every((p) => Array.isArray(p.brings) && p.brings.length > 0),
);
check(
  "every availability is one of the three known values",
  PROVIDERS.every((p) => ["available", "planned", "manual"].includes(p.availability)),
);
check("findProvider resolves a known name", !!findProvider("myops"));
check("findProvider returns undefined for an unknown one", !findProvider("nope"));

console.log("\nThe honesty rule");
// A connector is registered by appearing in the CONNECTORS map in the edge
// function. Parse the literal rather than trusting a comment.
// Matches both the empty single-line form and a populated multi-line one.
const connectorsBlock = edgeFn.match(
  /const CONNECTORS: Record<string, Connector> = \{([\s\S]*?)\};/,
);
check("the edge function declares a CONNECTORS map", !!connectorsBlock);
const registered = connectorsBlock
  ? [...connectorsBlock[1].matchAll(/^\s*["']?([a-z_]+)["']?\s*:/gm)].map((m) => m[1])
  : [];
console.log(`        (connectors registered: ${registered.length === 0 ? "none" : registered.join(", ")})`);

for (const p of PROVIDERS) {
  if (p.availability === "available") {
    check(
      `${p.provider} is marked available AND has a connector`,
      registered.includes(p.provider),
      "marked 'available' in the registry but absent from CONNECTORS — the UI would offer a Test Connection that cannot work",
    );
  } else {
    check(`${p.provider} is not runnable from the UI`, !canRun(p));
  }
}
check(
  "no connector is registered for a provider the registry does not declare",
  registered.every((r) => PROVIDERS.some((p) => p.provider === r)),
);

console.log("\nCredentials are named, never carried");
for (const p of PROVIDERS) {
  if (p.credentialRef === null) continue;
  check(
    `${p.provider} credentialRef is a secret NAME, not a value`,
    /^[A-Z][A-Z0-9_]{2,63}$/.test(p.credentialRef),
    `got ${JSON.stringify(p.credentialRef)} — must match the check constraint in migration 054`,
  );
}

const registrySource = readFileSync(
  new URL("../src/lib/integrations/registry.ts", import.meta.url),
  "utf8",
);
const secretShaped = [
  [/sk-[a-zA-Z0-9]{16,}/, "an API key"],
  [/Bearer\s+[A-Za-z0-9._-]{16,}/, "a bearer token"],
  [/["'][A-Za-z0-9_-]{40,}["']/, "a long opaque string"],
];
for (const [re, label] of secretShaped) {
  check(`registry contains no ${label}`, !re.test(registrySource));
}
check(
  "the edge function reads credentials from the environment, not from the row",
  edgeFn.includes("Deno.env.get(row.credential_ref)"),
);
check(
  "the edge function never returns the credential to the caller",
  !/credential\s*[,}]/.test(edgeFn.split("return json(")[1] ?? ""),
);

console.log(failures ? `\n${failures} FAILING\n` : "\nall green\n");
process.exit(failures ? 1 : 0);
