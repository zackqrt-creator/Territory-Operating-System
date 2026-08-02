import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createTask, deleteTask, listMyTasks, listProfiles, updateTask } from "../lib/api";
import type { PersonalTask, Profile, TaskStatus } from "../lib/types";
import TaskPhotos from "../components/TaskPhotos";
import { daysUntil, formatDateShort, tomorrow } from "../utils/dates";

const COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
];

/**
 * Personal/team task board (Trello-style). Private by default — a task is
 * only visible to its owner and anyone it's explicitly shared with, enforced
 * by row-level security, not just the UI. Duplicate-with-a-date exists so a
 * recurring task never has to be retyped.
 */
export default function Tasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TaskStatus>("todo");

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  function refresh() {
    return Promise.all([listMyTasks(), listProfiles()]).then(([t, p]) => {
      setTasks(t);
      setProfiles(p);
    });
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const teammates = profiles.filter((p) => p.id !== profile?.id);
  const nameOf = (id: string) =>
    id === profile?.id ? "You" : (profiles.find((p) => p.id === id)?.display_name ?? "?");

  async function onCreate() {
    if (!title.trim() || !profile) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        notes: notes.trim() || null,
        due_date: due || null,
        shared_with: sharedWith,
        assigned_to: assignTo,
        territory_id: profile.territory_id,
        owner_id: profile.id,
      });
      setTitle("");
      setNotes("");
      setDue("");
      setSharedWith([]);
      setAssignTo(null);
      setShowForm(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  const inTab = tasks.filter((t) => t.status === tab);
  const countFor = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;

  /*
   * Done, grouped by the day the work actually happened.
   *
   * A flat list of thirteen finished tasks answers "how much have I ever done",
   * which nobody asks. The question at the end of a shift is "did I get through
   * today", and that needs today separated out and counted. Grouping is by
   * done_at, not due_date -- a task for Wednesday's case that got done on Monday
   * belongs under Monday.
   *
   * Tasks completed before done_at was rendered have the timestamp already, so
   * nothing is stranded; only rows genuinely missing it fall into "Earlier".
   */
  const doneByDay = (() => {
    const groups = new Map<string, PersonalTask[]>();
    for (const t of tasks.filter((x) => x.status === "done")) {
      const day = t.done_at ? t.done_at.slice(0, 10) : "";
      groups.set(day, [...(groups.get(day) ?? []), t]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  })();
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">My tasks</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Close" : "+ New task"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Private to you unless you share or assign one to a teammate. Assigned tasks land on their
        board with your name on them. Duplicate a recurring task instead of retyping it.
      </p>

      {showForm && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 placeholder:text-slate-500"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes (optional)..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-slate-400">Due</label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
            />
          </div>
          {teammates.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-slate-500">Assign to</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setAssignTo(null)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    assignTo === null ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Me
                </button>
                {teammates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setAssignTo((prev) => (prev === t.id ? null : t.id))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      assignTo === t.id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {t.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {teammates.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-slate-500">Share with (optional — private otherwise)</p>
              <div className="flex flex-wrap gap-1.5">
                {teammates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      setSharedWith((prev) =>
                        prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      sharedWith.includes(t.id) ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {t.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={onCreate}
            disabled={saving || !title.trim()}
            className="mt-3 w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-2.5 font-semibold text-white shadow-lg shadow-sky-600/20 disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : assignTo
                ? `Assign to ${teammates.find((t) => t.id === assignTo)?.display_name ?? "teammate"}`
                : sharedWith.length > 0
                  ? "Create shared task"
                  : "Create private task"}
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {COLUMNS.map((c) => (
          <button
            key={c.value}
            onClick={() => setTab(c.value)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
              tab === c.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {c.label} ({countFor(c.value)})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : inTab.length === 0 ? (
        <p className="mt-8 text-slate-400">Nothing here.</p>
      ) : tab === "done" ? (
        <div className="mt-4 space-y-4">
          {doneByDay.map(([day, group]) => (
            <DoneDay
              key={day || "undated"}
              day={day}
              tasks={group}
              isToday={day === todayISO}
              meId={profile?.id ?? ""}
              territoryId={profile?.territory_id ?? ""}
              nameOf={nameOf}
              onChanged={refresh}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {inTab.map((t) => (
            <TaskCard key={t.id} task={t} meId={profile?.id ?? ""} territoryId={profile?.territory_id ?? ""} nameOf={nameOf} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One day's finished work. Today is open on arrival and labelled as the day's
 * summary -- that is the whole reason to open this tab. Older days collapse, so
 * the history is reachable without burying what you came to check.
 */
function DoneDay({
  day,
  tasks,
  isToday,
  meId,
  territoryId,
  nameOf,
  onChanged,
}: {
  day: string;
  tasks: PersonalTask[];
  isToday: boolean;
  meId: string;
  territoryId: string;
  nameOf: (id: string) => string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(isToday);
  const label = !day ? "Earlier (no date recorded)" : isToday ? "Today" : formatDateShort(day);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
      >
        <span className={`text-sm font-semibold ${isToday ? "text-emerald-400" : "text-slate-400"}`}>
          {label} · {tasks.length} done
        </span>
        <span className="text-xs text-slate-500">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              meId={meId}
              territoryId={territoryId}
              nameOf={nameOf}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  meId,
  territoryId,
  nameOf,
  onChanged,
}: {
  task: PersonalTask;
  meId: string;
  territoryId: string;
  nameOf: (id: string) => string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [dupDate, setDupDate] = useState(tomorrow());
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(task.title);
  const [eNotes, setENotes] = useState(task.notes ?? "");

  const overdue = task.due_date && task.status !== "done" && daysUntil(task.due_date) < 0;
  const mine = task.owner_id === meId;

  async function move(next: TaskStatus) {
    setBusy(true);
    try {
      await updateTask(task.id, {
        status: next,
        done_at: next === "done" ? new Date().toISOString() : null,
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate() {
    setBusy(true);
    try {
      await createTask({
        title: task.title,
        notes: task.notes,
        due_date: dupDate || null,
        shared_with: task.shared_with,
        territory_id: territoryId,
        owner_id: meId,
      });
      setDuplicating(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    setBusy(true);
    try {
      await updateTask(task.id, { title: eTitle.trim() || task.title, notes: eNotes.trim() || null });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-3 ${
        task.status === "done"
          ? "border-emerald-900 bg-emerald-950/15"
          : overdue
            ? "border-red-800 bg-red-950/25"
            : "border-slate-700 bg-slate-900/40"
      }`}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            value={eTitle}
            onChange={(e) => setETitle(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
          <textarea
            value={eNotes}
            onChange={(e) => setENotes(e.target.value)}
            rows={2}
            placeholder="Notes..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm text-slate-100">
              Cancel
            </button>
            <button onClick={onSaveEdit} disabled={busy} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-100"}`}>
            {task.title}
          </p>
          {task.notes && <p className="mt-0.5 text-sm text-slate-400">{task.notes}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {task.status === "done" && task.done_at ? (
              <span className="font-medium text-emerald-400">
                Completed {formatDateShort(task.done_at.slice(0, 10))}
              </span>
            ) : (
              task.due_date && (
                <span className={overdue ? "font-medium text-red-300" : ""}>
                  Due {formatDateShort(task.due_date)}
                  {overdue ? " · overdue" : ""}
                </span>
              )
            )}
            {task.assigned_to === meId && !mine && (
              <span className="rounded-full bg-violet-900/50 px-2 py-0.5 font-medium text-violet-300">
                📌 assigned by {nameOf(task.owner_id)}
              </span>
            )}
            {mine && task.assigned_to && task.assigned_to !== meId && (
              <span className="rounded-full bg-violet-900/50 px-2 py-0.5 text-violet-300">
                → {nameOf(task.assigned_to)}
              </span>
            )}
            {!mine && task.assigned_to !== meId && (
              <span className="text-sky-300">from {nameOf(task.owner_id)}</span>
            )}
            {task.source_note_id && <span>⏰ from a note</span>}
            {task.shared_with.length > 0 && (
              <span className="rounded-full bg-sky-900/50 px-2 py-0.5 text-sky-300">
                👥 {task.shared_with.map(nameOf).join(", ")}
              </span>
            )}
            {task.shared_with.length === 0 && !task.assigned_to && mine && <span>🔒 private</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPhotos((v) => !v)}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300"
            >
              {showPhotos ? "Hide photos" : "Photos"}
            </button>
            {task.status !== "todo" && (
              <button onClick={() => move(task.status === "done" ? "doing" : "todo")} disabled={busy} className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300">
                ← Back
              </button>
            )}
            {task.status !== "done" && (
              <button
                onClick={() => move(task.status === "todo" ? "doing" : "done")}
                disabled={busy}
                className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white"
              >
                {task.status === "todo" ? "Start →" : "Mark complete"}
              </button>
            )}
            {duplicating ? (
              <span className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dupDate}
                  onChange={(e) => setDupDate(e.target.value)}
                  className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                />
                <button onClick={onDuplicate} disabled={busy} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  Create copy
                </button>
                <button onClick={() => setDuplicating(false)} className="text-xs text-slate-500 underline">
                  cancel
                </button>
              </span>
            ) : (
              <button onClick={() => setDuplicating(true)} className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300">
                ⧉ Duplicate
              </button>
            )}
            <button onClick={() => setEditing(true)} className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300">
              Edit
            </button>
            {mine && (
              <button onClick={onDelete} disabled={busy} className="ml-auto text-xs text-slate-600">
                ✕
              </button>
            )}
          </div>

          {showPhotos && (
            <TaskPhotos taskId={task.id} territoryId={territoryId || null} currentStage={task.status} />
          )}
        </>
      )}
    </div>
  );
}
