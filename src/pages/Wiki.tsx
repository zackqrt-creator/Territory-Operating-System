import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { createNotebook, createPage, listNotebooks, listPages } from "../lib/api";
import type { Notebook, WikiPage } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";

const ENTITY_ICON: Record<string, string> = {
  surgeon: "🩺",
  facility: "🏥",
  tote_template: "🧰",
  catalog_item: "🔩",
};

/**
 * Wiki index: every page, searchable, newest-edited first — the entry
 * point into the linked note graph. Surgeon/Facility/Set canonical pages
 * live here alongside freeform troubleshooting writeups. Notebooks are a
 * flat-first folder layer on top — filter to one, and new pages made from
 * that filter land in it automatically, so filing never adds an extra step.
 */
export default function Wiki() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [notebookFilter, setNotebookFilter] = useState<string | "all" | "unfiled">("all");
  const [addingNotebook, setAddingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");

  function refresh() {
    return Promise.all([listPages(), listNotebooks()]).then(([p, n]) => {
      setPages(p);
      setNotebooks(n);
    });
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = pages;
    if (notebookFilter === "unfiled") list = list.filter((p) => !p.notebook_id);
    else if (notebookFilter !== "all") list = list.filter((p) => p.notebook_id === notebookFilter);

    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (p) => p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle),
    );
  }, [pages, q, notebookFilter]);

  async function onCreate() {
    if (!profile || !q.trim() || creating) return;
    setCreating(true);
    try {
      const page = await createPage({
        territory_id: profile.territory_id,
        title: q.trim(),
        created_by: profile.id,
        notebook_id: notebookFilter === "all" || notebookFilter === "unfiled" ? null : notebookFilter,
      });
      navigate(`/wiki/${page.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function onCreateNotebook() {
    if (!profile || !newNotebookName.trim()) return;
    const created = await createNotebook({
      territory_id: profile.territory_id,
      name: newNotebookName.trim(),
      created_by: profile.id,
    });
    setNotebooks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewNotebookName("");
    setAddingNotebook(false);
    setNotebookFilter(created.id);
  }

  const exactMatch = pages.some((p) => p.title.toLowerCase() === q.trim().toLowerCase());
  const notebookName = (id: string | null) => notebooks.find((n) => n.id === id)?.name ?? null;

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Wiki</h1>
      <p className="mt-1 text-sm text-slate-400">
        Linked notes — surgeon quirks, facility rules, sets, troubleshooting. Type{" "}
        <code className="rounded bg-slate-800 px-1 text-sky-300">[[Title]]</code> in any page to
        link another, or <code className="rounded bg-slate-800 px-1 text-sky-300">- [ ]</code> for
        a checkbox.
      </p>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setNotebookFilter("all")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            notebookFilter === "all" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          All ({pages.length})
        </button>
        <button
          onClick={() => setNotebookFilter("unfiled")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            notebookFilter === "unfiled" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          📄 Unfiled
        </button>
        {notebooks.map((n) => (
          <button
            key={n.id}
            onClick={() => setNotebookFilter(n.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              notebookFilter === n.id ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            📓 {n.name}
          </button>
        ))}
        <button
          onClick={() => setAddingNotebook(true)}
          className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 text-sm font-medium text-sky-400"
        >
          + Notebook
        </button>
      </div>

      {addingNotebook && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            placeholder="Notebook name…"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={onCreateNotebook}
            disabled={!newNotebookName.trim()}
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create
          </button>
          <button onClick={() => setAddingNotebook(false)} className="shrink-0 text-sm text-slate-500 underline">
            Cancel
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            notebookFilter === "all" || notebookFilter === "unfiled"
              ? "Search or create a page…"
              : `Search or create in ${notebookName(notebookFilter)}…`
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
      </div>

      {q.trim() && !exactMatch && (
        <button
          onClick={onCreate}
          disabled={creating}
          className="mt-2 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-left text-sm font-medium text-white disabled:opacity-50"
        >
          + Create page “{q.trim()}”
          {notebookFilter !== "all" && notebookFilter !== "unfiled" ? ` in ${notebookName(notebookFilter)}` : ""}
        </button>
      )}

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-400">
          {pages.length === 0 ? "No pages yet — create the first one above." : "No pages match."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/wiki/${p.id}`}
              className="block rounded-xl border border-slate-700 bg-slate-900/40 p-3 active:bg-slate-800"
            >
              <div className="flex items-center gap-1.5">
                {p.pinned && <span className="text-amber-400">📌</span>}
                {p.entity_type && <span>{ENTITY_ICON[p.entity_type]}</span>}
                <span className="font-medium text-white">{p.title}</span>
              </div>
              {p.body && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-400">
                  {p.body.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {notebookFilter === "all" && notebookName(p.notebook_id) ? `📓 ${notebookName(p.notebook_id)} · ` : ""}
                edited {formatRelativeDay(p.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
