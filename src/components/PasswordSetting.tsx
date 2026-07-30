import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

/**
 * Set or change the sign-in password.
 *
 * Deliberately reachable in two taps from anywhere, because the moment it
 * matters is the moment you cannot get in -- and by then it is too late to set
 * one. Anyone signing in by emailed link should do this once and never think
 * about the mailer's daily limit again.
 */
export default function PasswordSetting() {
  const { setPassword, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!session) return null;

  async function save() {
    if (value.length < 8) {
      setMessage({ ok: false, text: "Use at least 8 characters." });
      return;
    }
    if (value !== confirm) {
      setMessage({ ok: false, text: "The two don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await setPassword(value);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setValue("");
    setConfirm("");
    setMessage({ ok: true, text: "Saved. You can sign in with this from now on." });
  }

  const field =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500";

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <KeyRound size={15} className="shrink-0 text-sky-300" />
        <span className="flex-1 text-sm font-medium text-slate-200">Sign-in password</span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Set"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">
            Sign-in emails are limited to a couple a day, so a link is a bad thing to depend on in
            the field. Set a password once and it always works.
          </p>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={field}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={field}
          />
          {message && (
            <p className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
              {message.text}
            </p>
          )}
          <button
            onClick={save}
            disabled={busy || !value || !confirm}
            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      )}
    </div>
  );
}
