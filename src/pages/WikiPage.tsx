import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  createPage,
  deletePage,
  getPage,
  listBacklinks,
  searchPages,
  setPagePinned,
  updatePage,
} from "../lib/api";
import type { WikiPage as WikiPageType, PageLink } from "../lib/types";
import { extractStructuredFields, tokenizeBody } from "../lib/wikilinks";
import { formatRelativeDay } from "../utils/dates";

/** Renders body text with [[links]] as clickable spans; unresolved links are dashed/amber. */
function RenderedBody({ body, onFollow }: { body: string; onFollow: (title: string) => void }) {
  const tokens = tokenizeBody(body);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
      {tokens.map((t, i) =>
        t.type === "text" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <button
            key={i}
            onClick={() => onFollow(t.text)}
            className="rounded bg-sky-950/60 px-1 text-sky-300 underline decoration-sky-700 underline-offset-2"
          >
            {t.display}
          </button>
        ),
      )}
    </p>
  );
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

      {fields.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Structured fields — read by the pack-list engine
          </p>
          <div className="mt-2 space-y-1">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="shrink-0 font-medium text-slate-400">{f.key}</span>
                <RenderedBody body={f.value} onFollow={onFollow} />
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
              "Write freely. Use [[Title]] to link another page (surgeon, facility, set, or a new note).\n\nStructured fields the pack-list engine can read:\nSet:: [[KAONE Setup]]\nFacilities:: [[Saint Joseph's]]\nExcludes:: [[San Joaquin General]]"
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600"
          />
        ) : page.body ? (
          <RenderedBody body={page.body} onFollow={onFollow} />
        ) : (
          <p className="text-sm text-slate-600">Empty page — tap Edit to write something.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {editing ? (
          <>
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
