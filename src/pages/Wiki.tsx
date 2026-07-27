import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Pin, Stethoscope, Building2, Wrench, Bolt, FileText, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { createPage, listPages } from "../lib/api";
import type { WikiPage } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";

const ENTITY_ICON: Record<string, typeof FileText> = {
  surgeon: Stethoscope,
  facility: Building2,
  tote_template: Wrench,
  catalog_item: Bolt,
};

/**
 * Knowledge base: the durable second-brain layer, backed by linked pages.
 * Surgeon quirks, facility rules, sets, troubleshooting writeups — promoted
 * up from raw capture notes or written directly. Cross-linkable with
 * [[Title]]. Newest-edited first, pinned on top.
 */
export default function Knowledge() {
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
    const base = needle
      ? pages.filter(
          (p) => p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle),
        )
      : pages;
    return [...base].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [pages, q]);

  async function onCreate() {
    if (!profile || !q.trim() || creating) return;
    setCreating(true);
    try {
      const page = await createPage({ territory_id: profile.territory_id, title: q.trim(), created_by: profile.id });
      navigate(`/pages/${page.id}`);
    } finally {
      setCreating(false);
    }
  }

  const exactMatch = pages.some((p) => p.title.toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Knowledge base</h1>
      <p className="mt-1 text-sm text-slate-400">
        Durable knowledge promoted from notes — surgeon quirks, facility rules, sets,
        troubleshooting. Type{" "}
        <code className="rounded bg-slate-800 px-1 text-sky-300">[[Title]]</code> to link another
        page.
      </p>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or create a note…"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 pl-9 pr-4 text-white placeholder:text-slate-500"
        />
      </div>

      {q.trim() && !exactMatch && (
        <button
          onClick={onCreate}
          disabled={creating}
          className="mt-2 flex w-full items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-left text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Create page “{q.trim()}”
        </button>
      )}

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-400">
          {pages.length === 0 ? "No notes yet — create the first one above." : "No notes match."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((p) => {
            const Icon = p.entity_type ? ENTITY_ICON[p.entity_type] ?? FileText : FileText;
            return (
              <Link
                key={p.id}
                to={`/pages/${p.id}`}
                className="block rounded-xl border border-slate-700 bg-slate-900/40 p-3 active:bg-slate-800"
              >
                <div className="flex items-center gap-1.5">
                  {p.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-medium text-white">{p.title}</span>
                </div>
                {p.body && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-400">
                    {p.body.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">edited {formatRelativeDay(p.updated_at)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
