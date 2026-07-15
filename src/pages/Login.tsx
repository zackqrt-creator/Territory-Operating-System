import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signInWithEmail(email.trim());
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  }

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
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-normal text-white placeholder:text-slate-500"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-950/60 disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send magic link"}
          </button>
          <p className="text-center text-xs text-slate-500">
            No password needed — we'll email you a one-tap sign-in link.
          </p>
        </form>
      )}
    </div>
  );
}
