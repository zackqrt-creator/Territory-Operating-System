import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { assignRepToCase, listCaseAssignees, listProfiles, unassignRepFromCase } from "../lib/api";
import type { CaseAssignee, CaseAssigneeRole, Profile } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

const ROLES: { value: CaseAssigneeRole; label: string; hint: string }[] = [
  { value: "covering", label: "Covering", hint: "Backup or second pair of hands" },
  { value: "primary", label: "Primary", hint: "Running the case" },
  { value: "observing", label: "Observing", hint: "Shadowing or training" },
];

/**
 * Who else is on this case. Reps cover for each other constantly -- a second
 * rep runs the room, or takes the case outright when the first is double
 * booked -- and until now the calendar could only ever show one name.
 *
 * Degrades quiet if migration 045 has not been run: the section just stays
 * hidden rather than throwing inside the case sheet.
 */
export default function CaseCoverage({
  caseId,
  territoryId,
}: {
  caseId: string;
  territoryId: string | null;
}) {
  const { profile } = useAuth();
  const [assignees, setAssignees] = useState<CaseAssignee[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [available, setAvailable] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pickRole, setPickRole] = useState<CaseAssigneeRole>("covering");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listCaseAssignees([caseId])
      .then((rows) => {
        setAssignees(rows);
        setAvailable(true);
      })
      .catch(() => setAvailable(false));
  }

  useEffect(() => {
    refresh();
    listProfiles().then(setProfiles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  if (!available) return null;

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? "Teammate";

  // Don't offer someone who is already on the case.
  const assignable = profiles.filter((p) => !assignees.some((a) => a.profile_id === p.id));

  async function add(profileId: string) {
    if (!territoryId) return;
    setBusy(true);
    setError(null);
    try {
      await assignRepToCase({
        territory_id: territoryId,
        case_id: caseId,
        profile_id: profileId,
        role: pickRole,
        created_by: profile?.id ?? null,
      });
      setAdding(false);
      refresh();
    } catch {
      // Who is covering a case is the kind of thing you check once and then
      // trust. A tap that quietly did nothing means two people think the
      // other one has it.
      setError("Couldn't add that rep. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await unassignRepFromCase(id);
    } catch {
      setError("Couldn't remove that rep. Check your signal and try again.");
    }
    refresh();
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Coverage</h3>
        {!adding && assignable.length > 0 && territoryId && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-sky-400"
          >
            <UserPlus size={13} /> Add rep
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      {assignees.length === 0 && !adding && (
        <p className="mt-1 text-xs text-slate-500">
          Just you on this one. Add a rep if someone is covering.
        </p>
      )}

      {assignees.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {assignees.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/50 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">{nameOf(a.profile_id)}</span>
                <span className="text-[11px] capitalize text-slate-500">{a.role}</span>
              </span>
              <button
                onClick={() => remove(a.id)}
                aria-label={`Remove ${nameOf(a.profile_id)}`}
                className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-700"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2">
          <div className="flex flex-wrap gap-1">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setPickRole(r.value)}
                title={r.hint}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  pickRole === r.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            {assignable.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => add(p.id)}
                className="w-full rounded-md bg-slate-800 px-2.5 py-2 text-left text-sm text-slate-200 active:bg-slate-700 disabled:opacity-50"
              >
                {p.display_name ?? "Teammate"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAdding(false)}
            className="mt-2 text-xs text-slate-400"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
