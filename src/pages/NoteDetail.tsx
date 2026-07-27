import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  deleteNote,
  getNote,
  linkNoteToEntity,
  listCatalogItems,
  listCaseTemplatesWithItems,
  listFacilities,
  listSurgeons,
  listToteTemplatesWithItems,
  listNoteLinks,
  listTasksForNote,
  listUpcomingCases,
  spawnTaskFromNote,
  unlinkNote,
  updateNote,
  updateTask,
} from "../lib/api";
import type {
  CaseRow,
  CaseTemplateWithItems,
  CatalogItem,
  Facility,
  PersonalTask,
  Surgeon,
  TerritoryNote,
  TerritoryNoteEntityType,
  TerritoryNoteLink,
  TerritoryNoteType,
  TerritoryNoteVisibility,
  ToteTemplateWithItems,
} from "../lib/types";
import { formatDateShort, formatRelativeDay } from "../utils/dates";

const TYPE_OPTIONS: TerritoryNoteType[] = [
  "general", "case", "hospital", "inventory", "replenishment",
  "loaner", "consignment", "surgeon", "task", "meeting", "idea", "ai_summary",
];

const ENTITY_TYPE_LABEL: Record<TerritoryNoteEntityType, string> = {
  case: "Case",
  facility: "Hospital / facility",
  surgeon: "Surgeon",
  inventory_item: "Inventory unit",
  catalog_item: "Catalog item",
  tote_template: "Set / tray / tote",
  case_template: "Procedure",
};

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [note, setNote] = useState<TerritoryNote | null>(null);
  const [links, setLinks] = useState<TerritoryNoteLink[]>([]);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [entityType, setEntityType] = useState<TerritoryNoteEntityType>("case");
  const [entityId, setEntityId] = useState("");
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [surgeons, setSurgeons] = useState<Surgeon[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [totes, setTotes] = useState<ToteTemplateWithItems[] | null>(null);
  const [procedures, setProcedures] = useState<CaseTemplateWithItems[] | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");

  function refresh() {
    if (!id) return Promise.resolve();
    return Promise.all([getNote(id), listNoteLinks(id), listTasksForNote(id)]).then(
      ([n, l, t]) => {
        setNote(n);
        setTitle(n?.title ?? "");
        setBody(n?.body ?? "");
        setLinks(l);
        setTasks(t);
      },
    );
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveText() {
    if (!id) return;
    await updateNote(id, { title: title.trim() || "Untitled note", body });
  }

  async function patch(fields: Partial<Pick<TerritoryNote, "note_type" | "visibility" | "pinned" | "archived">>) {
    if (!id) return;
    await updateNote(id, fields);
    refresh();
  }

  function openLinkPicker() {
    setShowLinkPicker(true);
    if (!cases) listUpcomingCases().then(setCases);
    if (!facilities) listFacilities().then(setFacilities);
    if (!surgeons) listSurgeons().then(setSurgeons);
    if (!catalog) listCatalogItems().then(setCatalog);
    if (!totes) listToteTemplatesWithItems().then(setTotes);
    if (!procedures) listCaseTemplatesWithItems().then(setProcedures);
  }

  async function addLink() {
    if (!id || !profile || !entityId) return;
    await linkNoteToEntity({
      note_id: id,
      entity_type: entityType,
      entity_id: entityId,
      territory_id: profile.territory_id,
      created_by: profile.id,
    });
    setEntityId("");
    setShowLinkPicker(false);
    refresh();
  }

  function entityLabel(link: TerritoryNoteLink): string {
    if (link.entity_type === "case") {
      const c = cases?.find((x) => x.id === link.entity_id);
      return c ? `${formatDateShort(c.surgery_date)} · ${c.surgery_type}${c.surgeon ? ` · ${c.surgeon}` : ""}` : "Case";
    }
    if (link.entity_type === "facility") return facilities?.find((f) => f.id === link.entity_id)?.name ?? "Facility";
    if (link.entity_type === "surgeon") return surgeons?.find((s) => s.id === link.entity_id)?.name ?? "Surgeon";
    if (link.entity_type === "catalog_item") return catalog?.find((c) => c.id === link.entity_id)?.name ?? "Catalog item";
    if (link.entity_type === "tote_template") return totes?.find((t) => t.id === link.entity_id)?.name ?? "Set";
    if (link.entity_type === "case_template") return procedures?.find((p) => p.id === link.entity_id)?.name ?? "Procedure";
    return "Linked record";
  }

  async function addTask() {
    if (!id || !profile || !taskTitle.trim()) return;
    await spawnTaskFromNote({ note_id: id, title: taskTitle.trim(), territory_id: profile.territory_id, owner_id: profile.id });
    setTaskTitle("");
    refresh();
  }

  async function toggleTaskDone(t: PersonalTask) {
    await updateTask(t.id, { status: t.status === "done" ? "todo" : "done", done_at: t.status === "done" ? null : new Date().toISOString() });
    refresh();
  }

  async function removeNote() {
    if (!id) return;
    if (!confirm("Delete this note? This can't be undone.")) return;
    await deleteNote(id);
    navigate("/notes");
  }

  if (loading) return <div className="min-h-screen px-4 pt-6 text-slate-400">Loading...</div>;
  if (!note) return <div className="min-h-screen px-4 pt-6 text-slate-400">Note not found.</div>;

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveText}
        className="w-full bg-transparent text-2xl font-bold text-white outline-none"
        placeholder="Untitled note"
      />
      <p className="mt-1 text-xs text-slate-500">
        Updated {formatRelativeDay(note.updated_at)} · created {formatRelativeDay(note.created_at)}
      </p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={saveText}
        rows={6}
        placeholder="Write here..."
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => patch({ note_type: t })}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              note.note_type === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() =>
            patch({ visibility: (note.visibility === "private" ? "team" : "private") as TerritoryNoteVisibility })
          }
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          {note.visibility === "private" ? "🔒 Private" : "👥 Team"} — tap to change
        </button>
        <button
          onClick={() => patch({ pinned: !note.pinned })}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          {note.pinned ? "📌 Pinned" : "Pin note"}
        </button>
        <button
          onClick={() => patch({ archived: !note.archived })}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          {note.archived ? "Unarchive" : "Archive"}
        </button>
      </div>

      {note.ai_summary && (
        <div className="mt-4 rounded-xl border border-sky-800/60 bg-sky-950/20 p-3">
          <p className="text-xs font-medium text-sky-300">🧠 AI summary</p>
          <p className="mt-1 text-sm text-sky-100">{note.ai_summary}</p>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Linked records</h2>
          {!showLinkPicker && (
            <button onClick={openLinkPicker} className="text-sm font-medium text-sky-400">
              + Link
            </button>
          )}
        </div>

        {links.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Nothing linked yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                <span className="text-sm text-slate-200">
                  {ENTITY_TYPE_LABEL[l.entity_type]} · {entityLabel(l)}
                </span>
                <button onClick={() => unlinkNote(l.id).then(refresh)} className="text-xs text-slate-500 underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {showLinkPicker && (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as TerritoryNoteEntityType);
                setEntityId("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(ENTITY_TYPE_LABEL) as TerritoryNoteEntityType[]).map((t) => (
                <option key={t} value={t}>
                  {ENTITY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="">Choose…</option>
              {entityType === "case" &&
                (cases ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatDateShort(c.surgery_date)} · {c.surgery_type}
                    {c.surgeon ? ` · ${c.surgeon}` : ""}
                  </option>
                ))}
              {entityType === "facility" &&
                (facilities ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              {entityType === "surgeon" &&
                (surgeons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              {entityType === "catalog_item" &&
                (catalog ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              {entityType === "tote_template" &&
                (totes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              {entityType === "case_template" &&
                (procedures ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              {entityType === "inventory_item" && (
                <option disabled>Search inventory from the Inventory page for now</option>
              )}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLinkPicker(false)}
                className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={addLink}
                disabled={!entityId}
                className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Add link
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">
        <h2 className="text-sm font-semibold text-white">Tasks from this note</h2>
        {tasks.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTaskDone(t)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-left"
              >
                <span className={`text-lg ${t.status === "done" ? "text-emerald-400" : "text-slate-600"}`}>
                  {t.status === "done" ? "☑" : "☐"}
                </span>
                <span className={`text-sm ${t.status === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Add a task..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button onClick={addTask} disabled={!taskTitle.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <button onClick={removeNote} className="mt-8 text-sm text-red-400 underline underline-offset-2">
        Delete note
      </button>
    </div>
  );
}
