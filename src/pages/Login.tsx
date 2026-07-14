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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">CaseTrack</h1>
        <p className="mt-1 text-sm text-slate-400">Territory inventory &amp; case logistics</p>
      </div>

      {sent ? (
        <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-center">
          <p className="text-slate-200">Check your email for a sign-in link.</p>
          <p className="mt-1 text-sm text-slate-400">Sent to {email}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
          <input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sky-600 px-4 py-3 font-medium text-white active:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send magic link"}
          </button>
        </form>
      )}
    </div>
  );
}
