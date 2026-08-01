import { useEffect, useRef, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";
import { useOnline } from "../hooks/useOnline";

/**
 * A standing warning while the phone has no network, and a brief all-clear
 * when it comes back.
 *
 * Every write in this app is a live Supabase call, so with no signal a scan,
 * a log, or a note does not queue -- it fails. The dangerous version of that
 * is the silent one: you tap Save in a basement OR, the screen moves on, and
 * you find out at 6am that the tray was never logged. This makes the state
 * impossible to miss while it lasts.
 *
 * It sits above the bottom nav rather than under the header because that is
 * where a thumb already is and where the eye already goes on a phone, and
 * because the header is sticky -- a second sticky bar under it would fight it
 * for the same top edge.
 */
const ALL_CLEAR_MS = 3000;

export default function OfflineBar() {
  const online = useOnline();
  const [showAllClear, setShowAllClear] = useState(false);
  // Nobody needs an "back online" flash on first launch, only after a drop.
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowAllClear(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setShowAllClear(true);
    const t = setTimeout(() => setShowAllClear(false), ALL_CLEAR_MS);
    return () => clearTimeout(t);
  }, [online]);

  if (online && !showAllClear) return null;

  const offline = !online;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(var(--safe-bottom) + 4.25rem)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex max-w-lg items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium shadow-lg ${
          offline
            ? "border-amber-800 bg-amber-950 text-amber-400"
            : "border-emerald-900 bg-emerald-950 text-emerald-400"
        }`}
      >
        {offline ? (
          <>
            <CloudOff className="h-4 w-4 shrink-0" />
            <span>No signal — look, but don't count on anything saving.</span>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0" />
            <span>Back online. Re-check anything you saved offline.</span>
          </>
        )}
      </div>
    </div>
  );
}
