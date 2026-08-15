import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  addPagePhoto,
  createPage,
  deletePage,
  deletePagePhoto,
  getPage,
  listBacklinks,
  listPagePhotos,
  searchPages,
  setPagePinned,
  updatePage,
} from "../lib/api";
import type { WikiPage as WikiPageType, PageLink, PagePhoto } from "../lib/types";
import { appendChecklistItem, extractStructuredFields, toggleChecklistLine } from "../lib/wikilinks";
import { formatRelativeDay } from "../utils/dates";
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

export default function WikiPageView() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState<WikiPageType | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [backlinks, setBacklinks] = useState<(PageLink & { source: WikiPageType })[]>([]);
  const [photos, setPhotos] = useState<PagePhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPage(id)
      .then((p) => {
        setPage(p);
        if (p) {
          setTitleDraft(p.title);
          setBodyDraft(p.body);
          return listBacklinks(p.id, p.title).then((links) =>
            setBacklinks(links.filter((l) => l.source_page_id !== p.id)),
          );
        }
      })
      .finally(() => setLoading(false));
    listPagePhotos(id).then(setPhotos).catch(() => {});
  }, [id]);

  async function onFollow(title: string) {
    const matches = await searchPages(title, 5);
    const exact = matches.find((m) => m.title.toLowerCase() === title.toLowerCase());
    if (exact) {
      navigate(`/pages/${exact.id}`);
      return;
    }
    if (!profile) return;
    const created = await createPage({ territory_id: profile.territory_id, title, created_by: profile.id });
    navigate(`/pages/${created.id}`);
  }

  async function onSave() {
    if (!page || !profile || saving) return;
    setSaving(true);
    try {
      const updated = await updatePage(page.id, { title: titleDraft.trim(), body: bodyDraft }, profile.id);
      setPage(updated);
      setEditing(false);
      const links = await listBacklinks(updated.id, updated.title);
      setBacklinks(links.filter((l) => l.source_page_id !== updated.id));
    } finally {
      setSaving(false);
    }
  }

  /** Toggles a checkbox straight from view mode — no need to enter edit mode for the common case. */
  async function onToggleChecklist(lineIndex: number) {
    if (!page || !profile) return;
    const nextBody = toggleChecklistLine(page.body, lineIndex);
    const updated = await updatePage(page.id, { body: nextBody }, profile.id);
    setPage(updated);
    setBodyDraft(updated.body);
  }

  async function onTogglePin() {
    if (!page) return;
    await setPagePinned(page.id, !page.pinned);
    setPage({ ...page, pinned: !page.pinned });
  }

  async function onDelete() {
    if (!page) return;
    if (!confirm(`Delete "${page.title}"? This can't be undone.`)) return;
    await deletePage(page.id);
    navigate("/pages");
  }

  async function uploadPhotos(files: File[]) {
    if (!page || !profile || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        await addPagePhoto({ file, territory_id: profile.territory_id, page_id: page.id, uploaded_by: profile.id });
      }
      setPhotos(await listPagePhotos(page.id));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function onRemovePhoto(photoId: string) {
    await deletePagePhoto(photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  if (loading) return <div className="min-h-screen px-4 pt-6 text-slate-400">Loading...</div>;
  if (!page) return <div className="min-h-screen px-4 pt-6 text-slate-400">Page not found.</div>;

  const fields = editing ? [] : extractStructuredFields(page.body);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      {editing ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xl font-bold text-slate-100"
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-100">
            {page.pinned && <span className="mr-1 text-amber-400">📌</span>}
            {page.title}
          </h1>
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">
        edited {formatRelativeDay(page.updated_at)}
        {page.entity_type && ` · canonical page for this ${page.entity_type.replace("_", " ")}`}
      </p>

      {fields.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Structured fields — read by the pack-list engine
          </p>
          <div className="mt-2 space-y-1">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="shrink-0 font-medium text-slate-400">{f.key}</span>
                <ChecklistBody body={f.value} onFollow={onFollow} className="text-sm text-slate-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <FormatToolbar textareaRef={textareaRef} value={bodyDraft} onChange={setBodyDraft} />
        </div>
      )}

      <div className="mt-3">
        {editing ? (
          <div
            className={`rounded-lg ${dragOver ? "ring-2 ring-sky-500" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              uploadPhotos(imageFilesFrom(e.dataTransfer.items));
            }}
          >
            <textarea
              ref={textareaRef}
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              onPaste={(e) => {
                const files = imageFilesFrom(e.clipboardData.items);
                if (files.length > 0) uploadPhotos(files);
              }}
              rows={16}
              placeholder={
                'Write freely. **bold**, *italic*, ++underline++, ~~strike~~, # heading, [[links]], "- [ ] " checkboxes. Drag or paste a photo in anywhere.\n\nStructured fields the pack-list engine can read:\nSet:: [[KAONE Setup]]\nFacilities:: [[Saint Joseph\'s]]\nExcludes:: [[San Joaquin General]]'
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>
        ) : page.body ? (
          <ChecklistBody body={page.body} onFollow={onFollow} onToggle={onToggleChecklist} />
        ) : (
          <p className="text-sm text-slate-600">Empty page — tap Edit to write something.</p>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Photos</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="text-xs font-medium text-sky-400 disabled:opacity-50"
          >
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
              if (e.target.files) uploadPhotos(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
        {photos.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">
            {editing ? "Drag, paste, or tap + Photo to attach one." : "No photos yet."}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                </a>
                <button
                  onClick={() => onRemovePhoto(p.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {editing ? (
          <>
            <button
              onClick={() => setBodyDraft((prev) => appendChecklistItem(prev))}
              className="shrink-0 rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-300"
            >
              + ☑
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setTitleDraft(page.title);
                setBodyDraft(page.body);
              }}
              className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving || !titleDraft.trim()}
              className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white">
              Edit
            </button>
            <button onClick={onTogglePin} className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-amber-400">
              {page.pinned ? "Unpin" : "Pin"}
            </button>
            <button onClick={onDelete} className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-red-400">
              Delete
            </button>
          </>
        )}
      </div>

      {!editing && (
        <div className="mt-6 border-t border-slate-800 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Linked from {backlinks.length > 0 ? `(${backlinks.length})` : ""}
          </p>
          {backlinks.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">Nothing links here yet.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {backlinks.map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/pages/${l.source_page_id}`)}
                  className="block w-full rounded-lg bg-slate-800/60 px-3 py-2 text-left text-sm text-sky-300"
                >
                  {l.source?.title ?? "Untitled"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
