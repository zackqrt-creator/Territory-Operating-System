import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { createPage, listPages } from "../lib/api";
import type { WikiPage } from "../lib/types";
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
 * live here alongside freeform troubleshooting writeups.
 */
export default function Wiki() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    return listPages().then(setPages);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter(
      (p) => p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle),
    );
  }, [pages, q]);

  async function onCreate() {
    if (!profile || !q.trim() || creating) return;
    setCreating(true);
    try {
      const page = await createPage({ territory_id: profile.territory_id, title: q.trim(), created_by: profile.id });
      navigate(`/wiki/${page.id}`);
    } finally {
      setCreating(false);
    }
  }

  const exactMatch = pages.some((p) => p.title.toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Wiki</h1>
      <p className="mt-1 text-sm text-slate-400">
        Linked notes — surgeon quirks, facility rules, sets, troubleshooting. Type{" "}
        <code className="rounded bg-slate-800 px-1 text-sky-300">[[Title]]</code> in any page to
        link another.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or create a page…"
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
              <p className="mt-1 text-xs text-slate-500">edited {formatRelativeDay(p.updated_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
