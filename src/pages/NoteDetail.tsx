import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lock, Users, Pin } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  addNotePhoto,
  assignNoteTag,
  createNoteTag,
  deleteNote,
  deleteNotePhoto,
  getNote,
  linkNoteToEntity,
  listCatalogItems,
  listCaseTemplatesWithItems,
  listFacilities,
  listNotePhotos,
  listNoteTags,
  listSurgeons,
  listTagsForNote,
  listToteTemplatesWithItems,
  listNoteLinks,
  listTasksForNote,
  listUpcomingCases,
  spawnTaskFromNote,
  unassignNoteTag,
  unlinkNote,
  updateNote,
  updateTask,
} from "../lib/api";
import type {
  CaseRow,
  CaseTemplateWithItems,
  CatalogItem,
  Facility,
  NotePhoto,
  PersonalTask,
  Surgeon,
  TerritoryNote,
  TerritoryNoteEntityType,
  TerritoryNoteLink,
  TerritoryNoteTag,
  TerritoryNoteVisibility,
  ToteTemplateWithItems,
} from "../lib/types";
import { formatDateShort, formatRelativeDay } from "../utils/dates";
import { NOTE_KINDS } from "../lib/noteKinds";
import { appendChecklistItem, toggleChecklistLine } from "../lib/wikilinks";
import ChecklistBody from "../components/ChecklistBody";
import FormatToolbar from "../components/FormatToolbar";

/** Image files out of a drop or paste event — used by both drag-and-drop and clipboard-paste. */
function imageFilesFrom(items: DataTransferItemList | null): File[] {
  if (!items) return [];
  const files: File[] = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/*
 * This screen used to keep its own hardcoded list of note types, which had
 * drifted badly from the real one in noteKinds.ts. It offered six categories
 * that do not exist -- loaner, consignment, task, meeting, idea, and
 * ai_summary, the last of which promised a machine-written summary this app
 * has no AI to write -- while omitting two that do: Logistics and Playbook.
 * NOTE_KINDS is the single source now, so the picker cannot drift again.
 */

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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirtyRef = useRef(false);
  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  titleRef.current = title;
  bodyRef.current = body;

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

  const [photos, setPhotos] = useState<NotePhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [myTags, setMyTags] = useState<TerritoryNoteTag[]>([]);
  const [allTags, setAllTags] = useState<TerritoryNoteTag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  function refresh() {
    if (!id) return Promise.resolve();
    return Promise.all([
      getNote(id),
      listNoteLinks(id),
      listTasksForNote(id),
      listNotePhotos(id),
      listTagsForNote(id),
    ]).then(([n, l, t, ph, tg]) => {
      setNote(n);
      setTitle(n?.title ?? "");
      setBody(n?.body ?? "");
      setLinks(l);
      setTasks(t);
      setPhotos(ph);
      setMyTags(tg);
    });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveText() {
    if (!id || !dirtyRef.current) return;
    setSaveStatus("saving");
    dirtyRef.current = false;
    await updateNote(id, { title: titleRef.current.trim() || "Untitled note", body: bodyRef.current });
    setSaveStatus("saved");
  }

  /** The explicit Save button — always writes, even if the debounce already caught it, so tapping it is never a silent no-op. */
  async function saveNow() {
    if (!id) return;
    setSaveStatus("saving");
    dirtyRef.current = false;
    await updateNote(id, { title: titleRef.current.trim() || "Untitled note", body: bodyRef.current });
    setSaveStatus("saved");
  }

  function onEditTitle(next: string) {
    setTitle(next);
    dirtyRef.current = true;
    setSaveStatus("idle");
  }

  function onEditBody(next: string) {
    setBody(next);
    dirtyRef.current = true;
    setSaveStatus("idle");
  }

  // Autosave shortly after typing stops — a rep swiping back or switching apps
  // mid-edit shouldn't have to guess whether the blur handler caught it.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(saveText, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Safety net: flush any unsaved edit if the rep navigates away before the
  // debounce timer or a blur fires.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && id) {
        updateNote(id, { title: titleRef.current.trim() || "Untitled note", body: bodyRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(fields: Partial<Pick<TerritoryNote, "note_type" | "visibility" | "pinned" | "archived">>) {
    if (!id) return;
    await updateNote(id, fields);
    refresh();
  }

  /** Toggles a checkbox line straight from the rendered preview — saves immediately, no need to hand-edit the raw text. */
  async function onToggleChecklist(lineIndex: number) {
    if (!id) return;
    const nextBody = toggleChecklistLine(body, lineIndex);
    setBody(nextBody);
    await updateNote(id, { body: nextBody });
  }

  function onInsertChecklistItem() {
    onEditBody(appendChecklistItem(body));
  }

  async function onPickPhotos(files: File[]) {
    if (files.length === 0 || !id || !profile) return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        await addNotePhoto({ file, territory_id: profile.territory_id, note_id: id, uploaded_by: profile.id });
      }
      await refresh();
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onDeletePhoto(photoId: string) {
    await deleteNotePhoto(photoId);
    await refresh();
  }

  function openTagPicker() {
    setShowTagPicker(true);
    if (profile && allTags.length === 0) listNoteTags(profile.territory_id).then(setAllTags);
  }

  async function onAssignTag(tagId: string) {
    if (!id) return;
    await assignNoteTag(id, tagId);
    setShowTagPicker(false);
    await refresh();
  }

  async function onRemoveTag(tagId: string) {
    if (!id) return;
    await unassignNoteTag(id, tagId);
    await refresh();
  }

  async function onCreateTag() {
    if (!id || !profile || !newTagName.trim()) return;
    const created = await createNoteTag({
      name: newTagName.trim(),
      territory_id: profile.territory_id,
      created_by: profile.id,
    });
    setAllTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName("");
    await onAssignTag(created.id);
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
    <div className="min-h-screen px-4 pb-40 pt-6">
      <input
        value={title}
        onChange={(e) => onEditTitle(e.target.value)}
        onBlur={saveText}
        className="w-full bg-transparent text-2xl font-bold text-slate-100 outline-none"
        placeholder="Untitled note"
      />
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        Updated {formatRelativeDay(note.updated_at)} · created {formatRelativeDay(note.created_at)}
        {saveStatus === "saving" && <span className="text-amber-400">· Saving…</span>}
        {saveStatus === "saved" && <span className="text-emerald-400">· Saved ✓</span>}
      </p>

      <div className="mt-3">
        <FormatToolbar textareaRef={bodyTextareaRef} value={body} onChange={onEditBody} />
      </div>
      <div
        className={`mt-1.5 rounded-lg ${dragOver ? "ring-2 ring-sky-500" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onPickPhotos(imageFilesFrom(e.dataTransfer.items));
        }}
      >
        <textarea
          ref={bodyTextareaRef}
          value={body}
          onChange={(e) => onEditBody(e.target.value)}
          onBlur={saveText}
          onPaste={(e) => {
            const files = imageFilesFrom(e.clipboardData.items);
            if (files.length > 0) onPickPhotos(files);
          }}
          rows={6}
          placeholder={'Write here... **bold**, *italic*, ++underline++, ~~strike~~, # heading, "- [ ] " checkbox. Drag or paste a photo in anywhere.'}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      <button
        onClick={onInsertChecklistItem}
        className="mt-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300"
      >
        + ☑ Checkbox
      </button>

      {/* Live checklist preview — tap a box to toggle without hand-editing the raw text above. */}
      {body.includes("- [") && (
        <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
          <ChecklistBody body={body} onToggle={onToggleChecklist} className="text-sm text-slate-200" />
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Photos</h2>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="text-sm font-medium text-sky-400 disabled:opacity-50">
            {uploadingPhoto ? "Uploading…" : "+ Photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onPickPhotos(Array.from(e.target.files));
            }}
          />
        </div>
        {photos.length === 0 && (
          <p className="mt-1 text-xs text-slate-600">Drag, paste, or tap + Photo to attach one.</p>
        )}
        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                </a>
                <button
                  onClick={() => onDeletePhoto(p.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Notebook / tags</h2>
          {!showTagPicker && (
            <button onClick={openTagPicker} className="text-sm font-medium text-sky-400">
              + Notebook
            </button>
          )}
        </div>
        {myTags.length === 0 && !showTagPicker && (
          <p className="mt-1 text-sm text-slate-500">Not filed in a notebook yet.</p>
        )}
        {myTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myTags.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1.5 rounded-full bg-sky-950/50 px-3 py-1 text-sm text-sky-300"
              >
                {t.name}
                <button onClick={() => onRemoveTag(t.id)} className="text-sky-500">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        {showTagPicker && (
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            {allTags.filter((t) => !myTags.some((m) => m.id === t.id)).length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {allTags
                  .filter((t) => !myTags.some((m) => m.id === t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onAssignTag(t.id)}
                      className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300"
                    >
                      {t.name}
                    </button>
                  ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New notebook name…"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <button
                onClick={onCreateTag}
                disabled={!newTagName.trim()}
                className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
            <button onClick={() => setShowTagPicker(false)} className="mt-2 text-xs text-slate-500 underline">
              Close
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {NOTE_KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => patch({ note_type: k.value })}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              note.note_type === k.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {k.label}
          </button>
        ))}
        {/* A note already filed under a retired kind keeps a chip of its own,
            so an old note never looks like it lost its category. */}
        {!NOTE_KINDS.some((k) => k.value === note.note_type) && (
          <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-500">
            {note.note_type.replace("_", " ")} (retired)
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() =>
            patch({ visibility: (note.visibility === "private" ? "team" : "private") as TerritoryNoteVisibility })
          }
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          {note.visibility === "private" ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          {note.visibility === "private" ? "Private" : "Team"} — tap to change
        </button>
        <button
          onClick={() => patch({ pinned: !note.pinned })}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          <Pin className={`h-4 w-4 ${note.pinned ? "text-amber-400" : ""}`} />
          {note.pinned ? "Pinned" : "Pin note"}
        </button>
        <button
          onClick={() => patch({ archived: !note.archived })}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300"
        >
          {note.archived ? "Unarchive" : "Archive"}
        </button>
      </div>


      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Linked records</h2>
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
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
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
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
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
        <h2 className="text-sm font-semibold text-slate-100">Tasks from this note</h2>
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
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <button onClick={addTask} disabled={!taskTitle.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <button onClick={removeNote} className="mt-8 text-sm text-red-400 underline underline-offset-2">
        Delete note
      </button>

      {/* Fixed above the bottom nav, not just near the body text — this page
          scrolls long (photos, notebook, links, tasks), and a Save button
          only reachable by scrolling back up isn't "always there". */}
      <div
        className="fixed left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur-xl"
        style={{ bottom: "calc(64px + var(--safe-bottom))" }}
      >
        <button
          onClick={saveNow}
          disabled={saveStatus === "saving"}
          className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
