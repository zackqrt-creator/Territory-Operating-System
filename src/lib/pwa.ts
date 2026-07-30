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
