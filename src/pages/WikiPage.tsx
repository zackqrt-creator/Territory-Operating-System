import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  createNotebook,
  createPage,
  deletePage,
  getPage,
  listBacklinks,
  listNotebooks,
  searchPages,
  setPageNotebook,
  setPagePinned,
  updatePage,
} from "../lib/api";
import type { WikiPage as WikiPageType, PageLink, Notebook } from "../lib/types";
import { appendChecklistItem, extractStructuredFields, toggleChecklistLine } from "../lib/wikilinks";
import { formatRelativeDay } from "../utils/dates";
import ChecklistBody from "../components/ChecklistBody";

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
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pickingNotebook, setPickingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");

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
    listNotebooks().then(setNotebooks).catch(() => {});
  }, [id]);

  async function onFollow(title: string) {
    const matches = await searchPages(title, 5);
    const exact = matches.find((m) => m.title.toLowerCase() === title.toLowerCase());
    if (exact) {
      navigate(`/wiki/${exact.id}`);
      return;
    }
    if (!profile) return;
    const created = await createPage({ territory_id: profile.territory_id, title, created_by: profile.id });
    navigate(`/wiki/${created.id}`);
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

  async function onAddChecklistItem() {
    if (!page || !profile) return;
    const nextBody = appendChecklistItem(page.body);
    const updated = await updatePage(page.id, { body: nextBody }, profile.id);
    setPage(updated);
    setBodyDraft(updated.body);
    setEditing(true);
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
    navigate("/wiki");
  }

  async function onAssignNotebook(notebookId: string | null) {
    if (!page) return;
    await setPageNotebook(page.id, notebookId);
    setPage({ ...page, notebook_id: notebookId });
    setPickingNotebook(false);
  }

  async function onCreateNotebook() {
    if (!page || !profile || !newNotebookName.trim()) return;
    const created = await createNotebook({
      territory_id: profile.territory_id,
      name: newNotebookName.trim(),
      created_by: profile.id,
    });
    setNotebooks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewNotebookName("");
    await onAssignNotebook(created.id);
  }

  if (loading) return <div className="min-h-screen px-4 pt-6 text-slate-400">Loading...</div>;
  if (!page) return <div className="min-h-screen px-4 pt-6 text-slate-400">Page not found.</div>;

  const fields = editing ? [] : extractStructuredFields(page.body);
  const currentNotebook = notebooks.find((n) => n.id === page.notebook_id);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      {editing ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xl font-bold text-white"
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold text-white">
            {page.pinned && <span className="mr-1 text-amber-400">📌</span>}
            {page.title}
          </h1>
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">
        edited {formatRelativeDay(page.updated_at)}
        {page.entity_type && ` · canonical page for this ${page.entity_type.replace("_", " ")}`}
      </p>

      {!editing && (
        <div className="mt-2">
          {pickingNotebook ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-2.5">
              <button
                onClick={() => onAssignNotebook(null)}
                className="block w-full rounded px-2 py-1 text-left text-sm text-slate-300 active:bg-slate-700"
              >
                📄 Unfiled
              </button>
              {notebooks.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onAssignNotebook(n.id)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-slate-300 active:bg-slate-700"
                >
                  📓 {n.name}
                </button>
              ))}
              <div className="mt-1 flex gap-1.5">
                <input
                  value={newNotebookName}
                  onChange={(e) => setNewNotebookName(e.target.value)}
                  placeholder="New notebook…"
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white placeholder:text-slate-500"
                />
                <button
                  onClick={onCreateNotebook}
                  disabled={!newNotebookName.trim()}
                  className="min-h-0 shrink-0 rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Create
                </button>
              </div>
              <button onClick={() => setPickingNotebook(false)} className="mt-1 text-xs text-slate-500 underline">
                Close
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPickingNotebook(true)}
              className="text-xs font-medium text-sky-400 underline"
            >
              {currentNotebook ? `📓 ${currentNotebook.name}` : "📄 Unfiled — tap to file in a notebook"}
            </button>
          )}
        </div>
      )}

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

      <div className="mt-4">
        {editing ? (
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            rows={16}
            placeholder={
              "Write freely. Use [[Title]] to link another page, and \"- [ ] \" to add a checkbox.\n\nStructured fields the pack-list engine can read:\nSet:: [[KAONE Setup]]\nFacilities:: [[Saint Joseph's]]\nExcludes:: [[San Joaquin General]]"
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600"
          />
        ) : page.body ? (
          <ChecklistBody body={page.body} onFollow={onFollow} onToggle={onToggleChecklist} />
        ) : (
          <p className="text-sm text-slate-600">Empty page — tap Edit to write something.</p>
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
            <button onClick={onAddChecklistItem} className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-slate-300">
              + ☑
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
                  onClick={() => navigate(`/wiki/${l.source_page_id}`)}
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
