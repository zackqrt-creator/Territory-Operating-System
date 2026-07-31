import { useState, type FormEvent, type ReactNode } from "react";
import {
  Boxes,
  CalendarClock,
  ListChecks,
  NotebookPen,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hardReset } from "../lib/pwa";
import BrandMark from "../components/BrandMark";

/**
 * The front door.
 *
 * Two jobs, in this order. First, get a rep who is standing in a hospital
 * corridor into the app -- so the sign-in panel is above the fold on a phone
 * and password is the default, because the emailed link depends on a mailer
 * that allows a couple of sends a day and had already locked someone out of
 * their own inventory mid-workday. Second, say what this is, for the times it
 * gets opened by someone who is not Zack.
 *
 * The build stamp and the reset link at the bottom are not decoration. A
 * cached service worker can pin a device to an old build, and the sign-in
 * screen is the one screen you can always reach when that happens.
 */

/*
 * Two halves, deliberately equal. Counting boxes is only half the job -- what
 * you know about a tray and what you still owe on it carry the same weight,
 * so notes and tasks get their own entries here rather than one line tacked on
 * at the end.
 */
const CAPABILITIES = [
  {
    icon: ScanLine,
    title: "Scan the box, not the paperwork",
    body: "Point the camera at a GS1 label and the GTIN, lot and expiry come off it in one pass — no typing a 14-digit number off a curved surface.",
  },
  {
    icon: Boxes,
    title: "Know what is in every tote",
    body: "Sets, on-hand counts and every movement between facilities, editable down to the individual line.",
  },
  {
    icon: NotebookPen,
    title: "A note on anything, kept where you'll find it",
    body: "A surgeon's preference, a tray that came back short, why that transfer was really Wednesday — written on the record itself, editable later, not buried in your phone.",
  },
  {
    icon: ListChecks,
    title: "Follow-ups that come find you",
    body: "Tasks hang off the same records as the notes and carry due dates, so the thing you promised on Monday shows up on the screen you open Thursday.",
  },
  {
    icon: CalendarClock,
    title: "Walk in ready",
    body: "Each case checked against the stock you actually hold, so shortages surface the night before instead of in the sterile core.",
  },
];

export default function Login() {
  const { signInWithEmail, signInWithPassword } = useAuth();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    if (mode === "password") {
      const { error } = await signInWithPassword(email.trim(), password);
      setBusy(false);
      if (error) {
        // Supabase reports "wrong password" and "no password was ever set"
        // identically. The second is the likelier one here, so say so.
        setError(
          /invalid login/i.test(error)
            ? "That didn't match. If you've never set a password, use the email link below, then set one from More once you're in."
            : error,
        );
      }
      return;
    }

    const { error } = await signInWithEmail(email.trim());
    setBusy(false);
    if (error) {
      setError(
        /rate|limit|too many/i.test(error)
          ? "Too many sign-in emails for today. Use a password instead — you can set one from More once you're signed in."
          : error,
      );
    } else {
      setSent(true);
    }
  }

  const field =
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[15px] font-normal text-slate-100 placeholder:text-slate-600";

  return (
    <div className="relative min-h-full overflow-hidden">
      <Backdrop />

      {/*
       * One grid, two arrangements. On a phone it is a single column in source
       * order -- brand, sign-in, then what the thing does -- so the panel is
       * reachable without scrolling. On a wide screen the pitch stacks down
       * the left and the panel sits beside it, spanning both rows.
       */}
      <div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-y-12 px-5 py-12 lg:min-h-screen lg:grid-cols-[1.05fr_minmax(340px,380px)] lg:grid-rows-[auto_auto] lg:content-center lg:items-start lg:gap-x-16 lg:gap-y-0 lg:py-20">
        {/* Row 1 / left column: who this is. */}
        <header className="lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11 shrink-0" />
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-tight text-slate-100">Territory OS</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400/80">
                Field operations
              </p>
            </div>
          </div>

          <h1 className="mt-8 text-[1.85rem] font-semibold leading-[1.12] text-slate-100 sm:text-4xl lg:text-[2.6rem]">
            Every tray, every case,
            <br className="hidden sm:block" /> every lot accounted for.
          </h1>
        </header>

        {/* Mobile row 2 / desktop right column: the reason anyone is here. */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          {sent ? (
            <Panel>
              <p className="text-2xl">📬</p>
              <h2 className="mt-2 text-base font-semibold text-slate-100">Check your email</h2>
              <p className="mt-1 text-sm text-slate-400">
                A one-tap sign-in link is on its way to {email}.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setMode("password");
                }}
                className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-800/60 py-3 text-sm font-medium text-slate-200"
              >
                Use a password instead
              </button>
            </Panel>
          ) : (
            <Panel>
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-slate-100">Sign in</h2>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {mode === "password" ? "Password" : "Email link"}
                </span>
              </div>

              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <label className="block text-[13px] font-medium text-slate-400">
                  Work email
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={field}
                  />
                </label>

                {mode === "password" && (
                  <label className="block text-[13px] font-medium text-slate-400">
                    Password
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={field}
                    />
                  </label>
                )}

                {error && (
                  <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[13px] leading-snug text-red-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-3 text-[15px] font-semibold text-white shadow-lg shadow-sky-600/25 disabled:opacity-50"
                >
                  {busy
                    ? mode === "password"
                      ? "Signing in…"
                      : "Sending…"
                    : mode === "password"
                      ? "Sign in"
                      : "Email me a link"}
                </button>
              </form>

              <div className="mt-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-800" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  or
                </span>
                <span className="h-px flex-1 bg-slate-800" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "password" ? "link" : "password");
                  setError(null);
                }}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 text-[13px] font-medium text-slate-300"
              >
                {mode === "password" ? "Email me a sign-in link" : "Sign in with a password"}
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600">
                {mode === "password"
                  ? "No password yet? Use the email link once, then set one from More."
                  : "Sign-in emails are limited to a couple a day. A password has no limit."}
              </p>
            </Panel>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
            <ShieldCheck size={12} className="shrink-0" />
            Private to your territory. Installs to your home screen.
          </p>
        </div>

        {/* Mobile row 3 / desktop below the headline: what it actually does. */}
        {/*
         * On a wide screen this sits directly under the headline, in the same
         * column -- exactly where it reads as the sub-head. On a phone it falls
         * below the sign-in panel instead, because six lines of prose above the
         * panel pushed the Sign in button off a 664px-tall screen.
         */}
        <div className="lg:col-start-1 lg:row-start-2 lg:pt-6">
          <p className="max-w-lg border-t border-slate-800/80 pt-8 text-[15px] leading-relaxed text-slate-400 lg:border-0 lg:pt-0">
            The field system for orthopedic device reps. Consignment inventory and case logistics on
            one side; on the other, every note and follow-up filed against the tray, the surgeon or
            the shipment it belongs to — because what you know about a tray counts for as much as
            what you counted in it.
          </p>

          <ul className="mt-8 space-y-5">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-900/70 bg-sky-950/50 text-sky-400">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-100">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-9 text-center text-[11px] leading-relaxed text-slate-600 lg:text-left">
            Build {__BUILD_ID__}
            {" · "}
            <button
              onClick={hardReset}
              className="min-h-0 p-0 align-baseline underline decoration-slate-700 underline-offset-2"
            >
              not seeing recent changes?
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-900/[0.06] backdrop-blur-sm sm:p-6">
      {children}
    </div>
  );
}

/**
 * A faint instrument-panel grid behind everything, fading out downward so it
 * never competes with the text sitting on top of it.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(22,35,60,0.055) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(22,35,60,0.055) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(115% 70% at 50% 0%, #000 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(115% 70% at 50% 0%, #000 20%, transparent 78%)",
        }}
      />
      <div className="absolute -top-40 left-1/2 h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-sky-600/[0.07] blur-[110px]" />
    </div>
  );
}
