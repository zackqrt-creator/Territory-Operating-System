import { useEffect, useState } from "react";

/**
 * Whether the browser currently believes it has a network.
 *
 * This matters more here than in most apps. The work happens in hospitals --
 * basement ORs, sterile processing, loading docks -- where signal drops
 * without warning and comes back a few steps later. Every write in this app
 * goes straight to Supabase, so offline is not a degraded experience, it is a
 * failed save. Without a signal on screen, a scan that never landed looks
 * exactly like one that did.
 *
 * `navigator.onLine` is only ever trustworthy in the negative: false really
 * does mean no network, while true only means an interface is up and says
 * nothing about whether Supabase is reachable. That asymmetry is fine for what
 * this is used for -- warn on a definite no, stay quiet otherwise -- and it is
 * the reason this deliberately does not try to prove connectivity by polling.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // A phone that was asleep in a dead zone can miss the transition entirely,
    // so re-read the flag whenever the app comes back to the foreground.
    const recheck = () => {
      if (document.visibilityState === "visible") setOnline(navigator.onLine);
    };
    document.addEventListener("visibilitychange", recheck);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  return online;
}
