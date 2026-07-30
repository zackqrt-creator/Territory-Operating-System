import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";

/**
 * Password first, magic link second.
 *
 * This app was magic-link only, which read as friendly and turned out to be a
 * trap: the built-in mailer allows a couple of sends a day, so one cleared
 * cache or expired session locked a rep out of their own inventory until
 * tomorrow -- in the middle of a workday, with cases on the calendar. A
 * password has no send limit, needs no inbox, and works on hospital wifi that
 * cannot reach mail.
 *
 * The link stays available, because it is genuinely the better path on a new
 * device and for anyone who has not set a password yet.
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
        // Supabase says "Invalid login credentials" whether the password is
        // wrong or none was ever set. The second is likely here, so say so.
        setError(
          /invalid login/i.test(error)
            ? "That didn't match. If you've never set a password, use the email link below and set one from More once you're in."
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
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-normal text-white placeholder:text-slate-500";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-sky-700 text-2xl font-bold text-white shadow-xl shadow-sky-950/60">
          CT
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">CaseTrack</h1>
        <p className="mt-1.5 text-sm text-slate-400">Territory inventory &amp; case logistics</p>
      </div>

      {sent ? (
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center shadow-xl shadow-black/30">
          <p className="text-lg">📬</p>
          <p className="mt-2 font-medium text-slate-100">Check your email for a sign-in link.</p>
          <p className="mt-1 text-sm text-slate-400">Sent to {email}</p>
          <button
            onClick={() => {
              setSent(false);
              setMode("password");
            }}
            className="mt-4 text-sm text-sky-400 underline"
          >
            Use a password instead
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/30"
        >
          <label className="block text-sm font-medium text-slate-300">
            Work email
            <input
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>

          {mode === "password" && (
            <label className="block text-sm font-medium text-slate-300">
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

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-950/60 disabled:opacity-50"
          >
            {busy
              ? mode === "password"
                ? "Signing in…"
                : "Sending…"
              : mode === "password"
                ? "Sign in"
                : "Email me a link"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "password" ? "link" : "password");
              setError(null);
            }}
            className="w-full text-center text-xs text-slate-400 underline"
          >
            {mode === "password" ? "Email me a sign-in link instead" : "Use a password instead"}
          </button>

          {mode === "link" && (
            <p className="text-center text-[11px] text-slate-600">
              Sign-in emails are rate-limited to a couple a day. A password has no limit — set one
              from More once you're in.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
