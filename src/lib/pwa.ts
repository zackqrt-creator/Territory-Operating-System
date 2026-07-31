/**
 * Service-worker registration with an actual update path.
 *
 * vite-plugin-pwa's injected registerSW.js is one line -- `register('/sw.js')`
 * -- with no update handling. The worker precaches index.html, so an installed
 * PWA keeps serving whichever build it cached: the page never asks for a newer
 * one, and on a phone there is no "hard refresh" to force it. Deployed work
 * simply never arrived. `registerType: "autoUpdate"` only covers half of it --
 * workbox skipWaiting()s the new worker, but the page already running the old
 * JavaScript keeps running it until something reloads.
 *
 * So: check for a new worker on load, every few minutes, and every time the
 * app comes back to the foreground (the case that matters, since a PWA is
 * rarely closed). When a new one takes control, reload once.
 */

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function startUpdateWatch(): void {
  if (!("serviceWorker" in navigator)) return;

  // A first-ever install also claims the page and fires controllerchange.
  // Reloading then would be a pointless flash on someone's first visit.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((registration) => {
      warmShellCache();
      const check = () => registration.update().catch(() => {});
      check();
      setInterval(check, UPDATE_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    })
    .catch(() => {
      // No service worker is a worse offline story, not a broken app.
    });
}

/**
 * Put a copy of the shell in the runtime cache while we are demonstrably
 * online.
 *
 * Navigations are NetworkFirst now, so index.html is no longer precached and
 * an offline launch has nothing to fall back on until one has been cached at
 * runtime. The first page load of a session is not controlled by the worker,
 * so nothing would populate it until the second launch. This does it on the
 * first -- a rep who installs the app in the parking lot and walks into a
 * basement OR still gets a working app.
 */
function warmShellCache(): void {
  if (!("caches" in window)) return;
  caches
    .open("territory-os-shell")
    .then((cache) => cache.add("/"))
    .catch(() => {
      // Offline right now, or the fetch failed. The next load will retry.
    });
}

/**
 * Throw away every cached file and start over.
 *
 * The escape hatch for a device that is stuck on an old build. It is on the
 * sign-in screen because that is the one screen you can always reach -- being
 * stuck and being signed out tend to arrive together, and "delete the app and
 * re-add it" is not an acceptable answer mid-workday.
 *
 * Caches and service workers only. localStorage is left alone: the Supabase
 * session lives there, and clearing it would sign you out to fix a display
 * problem.
 */
export async function hardReset(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Reload regardless -- a partial clear still beats staying stuck.
  }
  // A changed URL defeats the back/forward cache as well as the HTTP one.
  window.location.replace(`${window.location.origin}/?fresh=${Date.now()}`);
}
