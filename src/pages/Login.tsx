import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hardReset } from "../lib/pwa";
import BrandMark from "../components/BrandMark";

/**
 * The front door, built as a board.
 *
 * Everyone who reaches this screen already knows what Territory OS is, so it
 * stopped being a pitch. What replaced the five capability blurbs is the one
 * claim that distinguishes this from a spreadsheet: counts and knowledge live
 * on the same record. That claim is made structurally -- two columns of one
 * board, joined by a rule -- rather than asserted in a paragraph.
 *
 * The grammar is the OR schedule board: flat, ruled, legible at arm's length
 * in a bright corridor. No cards, no panels, no shadows. Three graded rule
 * weights do every job those would have: 3px ink top and bottom for the
 * board's own edges, 1px for the column divider, hairline everywhere else.
 * If you are tempted to add a container here, add a rule instead.
 *
 * Two things are load-bearing rather than decorative. Password is the default
 * because the emailed link depends on a mailer that allows a couple of sends a
 * day and had already locked someone out of their own inventory mid-workday.
 * The build stamp and reset link at the bottom stay because a cached service
 * worker can pin a device to an old build, and this is the one screen you can
 * always reach when that happens.
 */
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
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-600";

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[30rem] flex-col justify-center px-5 py-8 sm:py-12">
      {/* The board's top edge. */}
      <div className="h-[3px] bg-slate-100" />

      <div className="mt-5 flex items-center gap-3">
        <BrandMark className="h-9 w-9" />
        <h1 className="text-[34px] font-bold leading-[0.98] tracking-[-0.045em] text-slate-100">
          Territory OS
        </h1>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between border-b border-slate-700 pb-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
        <span>{today}</span>
        <span>{sent ? "Link sent" : "Signed out"}</span>
      </div>

      {/*
       * The claim, made as structure. Two columns of one board is the argument;
       * the band underneath only names what the reader can already see.
       */}
      <div className="grid grid-cols-2">
        <div className="py-3.5 pr-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
            Counts
          </h2>
          <p className="mt-2 text-[13.5px] leading-snug text-slate-300">
            Every set, tote and tray — where it is, and when it's free.
          </p>
        </div>
        <div className="border-l border-slate-700 py-3.5 pl-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
            Knowledge
          </h2>
          <p className="mt-2 text-[13.5px] leading-snug text-slate-300">
            Why it came back short. Written on the tray itself.
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 border-b-[3px] border-t border-b-slate-100 border-t-slate-700 py-2.5 text-[12.5px] font-semibold text-slate-400">
        <Check size={15} strokeWidth={2.2} className="shrink-0 text-emerald-400" aria-hidden />
        One record holds both
      </p>

      {/*
       * The roster slot. Pinning this to the bottom of the viewport for thumb
       * reach opened a 330px hole under the board on a 844px phone, which read
       * as broken rather than as deliberate space. Centring the whole board
       * instead still lands the primary action in the lower third.
       */}
      <div className="mt-9">
        {sent ? (
          <div>
            <h2 className="text-base font-semibold text-slate-100">Check your email</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              A one-tap sign-in link is on its way to {email}.
            </p>
            <button
              onClick={() => {
                setSent(false);
                setMode("password");
              }}
              className="mt-4 w-full rounded-lg border border-slate-700 py-2.5 font-medium text-slate-400"
            >
              <span className="text-sm">Use a password instead</span>
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-2.5">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                  Work email
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1.5 ${field}`}
                />
              </label>

              {mode === "password" && (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                    Password
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`mt-1.5 ${field}`}
                  />
                </label>
              )}

              {error && (
                <p
                  role="alert"
                  className="border-l border-red-400 bg-red-950 px-3 py-2 text-[13px] leading-snug text-red-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
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

            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "link" : "password");
                setError(null);
              }}
              className="mt-2.5 w-full rounded-lg border border-slate-700 py-2.5 font-medium text-slate-400"
            >
              <span className="text-sm">
                {mode === "password" ? "Email me a link instead" : "Sign in with a password"}
              </span>
            </button>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {mode === "password"
                ? "No password yet? Use the email link once, then set one from More."
                : "Sign-in emails are limited to a couple a day. A password has no limit."}
            </p>
          </>
        )}

        <p className="mt-6 border-t border-slate-700 pt-3 text-[11px] text-slate-500">
          Private to your territory · Build {__BUILD_ID__}
          {" · "}
          <button
            onClick={hardReset}
            className="min-h-0 p-0 align-baseline text-slate-500 underline decoration-slate-700 underline-offset-2"
          >
            not seeing recent changes?
          </button>
        </p>
      </div>
    </div>
  );
}
