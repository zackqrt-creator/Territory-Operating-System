import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
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
