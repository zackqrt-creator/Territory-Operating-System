import { useEffect, useState } from "react";
import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { createTask, deleteTask, listTasksForEntity, updateTask } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { NoteEntityType, PersonalTask } from "../lib/types";
import { formatDateShort, tomorrow } from "../utils/dates";

/**
 * The task list belonging to one record.
 *
 * Notes say what happened; tasks say what still has to. Keeping them on the
 * record itself is the difference between "I know there's something about that
 * tray" and being told what it is when the tray is in front of you -- a rep
 * standing at a rack should not have to remember to go check a separate list.
 *
 * Done tasks stay visible but collapsed: what was already handled is exactly
 * the context you want when the same thing comes up again.
 */
export default function EntityTasks({
  entityType,
  entityId,
  title = "Tasks",
}: {
  entityType: NoteEntityType;
  entityId: string;
  title?: string;
}) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState(tomorrow());
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [available, setAvailable] = useState(true);

  function refresh() {
    return listTasksForEntity(entityType, entityId)
      .then((rows) => {
        setTasks(rows);
        setAvailable(true);
      })
      // Filing a task against this kind of record needs migration 048. Until
      // it runs, hide the section rather than showing a broken one.
      .catch(() => setAvailable(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function add() {
    if (!draft.trim() || !profile) return;
    setBusy(true);
    try {
      await createTask({
        title: draft.trim(),
        due_date: due || null,
        entity_type: entityType,
        entity_id: entityId,
        territory_id: profile.territory_id,
        owner_id: profile.id,
      });
      setDraft("");
      setDue(tomorrow());
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: PersonalTask) {
    setBusy(true);
    try {
      const done = task.status === "done";
      await updateTask(task.id, {
        status: done ? "todo" : "done",
        done_at: done ? null : new Date().toISOString(),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteTask(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <ListChecks size={13} />
          {title}
          {open.length > 0 ? ` (${open.length})` : ""}
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex min-h-0 items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
          >
            <Plus size={12} /> Add task
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="What needs doing?"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-[11px] text-slate-500">Due</label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white"
            />
            <button
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="ml-auto min-h-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={add}
              disabled={busy || !draft.trim()}
              className="min-h-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {open.length === 0 && !adding && (
        <p className="mt-1.5 text-xs text-slate-600">Nothing outstanding on this one.</p>
      )}

      {open.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} busy={busy} onToggle={toggle} onRemove={remove} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <button
            onClick={() => setShowDone((v) => !v)}
            className="mt-2 text-[11px] text-slate-600 active:text-slate-400"
          >
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && (
            <div className="mt-1.5 space-y-1.5 opacity-60">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} busy={busy} onToggle={toggle} onRemove={remove} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onToggle,
  onRemove,
}: {
  task: PersonalTask;
  busy: boolean;
  onToggle: (t: PersonalTask) => void;
  onRemove: (id: string) => void;
}) {
  const isDone = task.status === "done";
  const overdue = !isDone && task.due_date != null && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-start gap-2 rounded-lg bg-slate-900/50 px-2.5 py-2">
      <button
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-600"
        }`}
      >
        {isDone && <Check size={11} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? "text-slate-500 line-through" : "text-white"}`}>
          {task.title}
        </p>
        {task.due_date && (
          <p className={`text-[11px] ${overdue ? "text-red-400" : "text-slate-500"}`}>
            {overdue ? "Overdue " : "Due "}
            {formatDateShort(task.due_date)}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(task.id)}
        disabled={busy}
        aria-label="Delete task"
        className="min-h-0 shrink-0 rounded p-1 text-slate-600 active:bg-slate-700"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
