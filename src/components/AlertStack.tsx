import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CloudOff, Wifi, AlertTriangle } from "lucide-react";
import { useOnline } from "../hooks/useOnline";

/**
 * The one place the app admits something went wrong.
 *
 * Two things live here because they are the same problem seen from either
 * end: no signal (about to fail) and a write that just failed. They share a
 * stack so they can never cover each other up.
 *
 * It sits above the bottom nav rather than under the header because that is
 * where a thumb already is and where the eye already goes on a phone, and
 * because the header is sticky -- a second sticky bar under it would fight it
 * for the same top edge.
 */
const ALL_CLEAR_MS = 3000;
const FAILURE_MS = 6000;

/**
 * Why a global listener instead of a catch at each call site.
 *
 * Around fifty write handlers across the app are shaped `try { await save() }
 * finally { setBusy(false) }` -- no catch. That is not sloppiness so much as
 * the natural shape of a save button, but it means the rejection escapes into
 * an async event handler, where React has nowhere to put it. The screen moves
 * on. You find out the tray was never logged at 6am.
 *
 * Every one of those escapes lands here as `unhandledrejection`, so a single
 * listener covers all of them, including the ones written next month. Call
 * sites that already handle their own errors -- the scan sheets, the sticker
 * capture -- never reach this, so their specific messages still win.
 *
 * The message is deliberately vague about *what* failed, because this cannot
 * know. It is not trying to explain; it is trying to stop a failed save from
 * passing for a good one.
 */
function useSaveFailure(): string | null {
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as { message?: unknown } | null;
      const message = typeof reason?.message === "string" ? reason.message : "";

      // A stale token surfaces as a rejection too, but useAuth is already
      // going to bounce to the sign-in screen -- a toast on the way out is
      // just noise.
      if (/jwt|refresh token|not authenticated/i.test(message)) return;

      setFailure(
        /fetch|network|load failed/i.test(message)
          ? "That didn't save — no connection. Try it again."
          : "That didn't save. Check it before you rely on it.",
      );
      clearTimeout(timer);
      timer = setTimeout(() => setFailure(null), FAILURE_MS);
    }

    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      clearTimeout(timer);
    };
  }, []);

  return failure;
}

function useConnectionNotice(): { offline: boolean; allClear: boolean } {
  const online = useOnline();
  const [allClear, setAllClear] = useState(false);
  // Nobody needs a "back online" flash on first launch, only after a drop.
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setAllClear(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setAllClear(true);
    const t = setTimeout(() => setAllClear(false), ALL_CLEAR_MS);
    return () => clearTimeout(t);
  }, [online]);

  return { offline: !online, allClear };
}

const TONES = {
  warn: "border-amber-800 bg-amber-950 text-amber-400",
  good: "border-emerald-900 bg-emerald-950 text-emerald-400",
  bad: "border-red-900 bg-red-950 text-red-400",
} as const;

function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof CloudOff;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium shadow-lg ${TONES[tone]}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export default function AlertStack() {
  const { offline, allClear } = useConnectionNotice();
  const failure = useSaveFailure();

  if (!offline && !allClear && !failure) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-2 px-3"
      style={{ bottom: "calc(var(--safe-bottom) + 4.25rem)" }}
      role="status"
      aria-live="polite"
    >
      {failure && (
        <Pill tone="bad" icon={AlertTriangle}>
          {failure}
        </Pill>
      )}
      {offline && (
        <Pill tone="warn" icon={CloudOff}>
          No signal — look, but don&apos;t count on anything saving.
        </Pill>
      )}
      {allClear && (
        <Pill tone="good" icon={Wifi}>
          Back online. Re-check anything you saved offline.
        </Pill>
      )}
    </div>
  );
}
