import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
  );
}

/**
 * The one Supabase project this app belongs to.
 *
 * There were two. `sgfjsoanfhmpjcvwbzqx` was created 2026-06-18 alongside the
 * abandoned `casetrack-app` repo and is paused and empty; `tylytbjxizxukefpplcw`
 * ("Zack CaseTrack", 2026-07-20) holds everything -- the 931-row catalog, the
 * auth users, the whole schema. Two projects that look alike is how a build
 * ends up silently talking to an empty database and reporting no inventory
 * rather than failing.
 *
 * This does not throw: pointing at a fork or a local stack is legitimate. It
 * just refuses to let a mismatch be silent.
 */
const CANONICAL_PROJECT_REF = "tylytbjxizxukefpplcw";

if (!url.includes(CANONICAL_PROJECT_REF)) {
  console.warn(
    `[Territory OS] Supabase URL does not point at the canonical project ` +
      `(${CANONICAL_PROJECT_REF}). Currently: ${url}. If that is deliberate, ` +
      `ignore this; if not, the app is talking to the wrong database.`,
  );
}

/**
 * Session handling is spelled out rather than left to defaults because being
 * signed out is expensive here: the fallback is a magic link, and the built-in
 * mailer only allows a couple of sends a day, so an unexpected sign-out can
 * cost a rep access to their inventory for the rest of the day.
 *
 * persistSession keeps it in localStorage across app launches; autoRefreshToken
 * renews the access token in the background so a long gap between uses does not
 * end the session; detectSessionInUrl completes a magic-link redirect.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Deliberately NOT setting storageKey: changing it orphans every session
    // already in localStorage and signs everyone out, which is the exact
    // failure this block exists to avoid.
  },
});
