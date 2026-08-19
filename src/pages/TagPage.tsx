import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Tag } from "lucide-react";
import { getNoteTag, getEntityLabel, listEntitiesByTag } from "../lib/api";
import type { EntityTagAssignment, GraphEntityType, TerritoryNoteTag } from "../lib/types";

const TYPE_LABEL: Record<GraphEntityType, string> = {
  case: "Cases",
  inventory_item: "Inventory items",
  surgeon: "Surgeons",
  facility: "Facilities",
  catalog_item: "Catalog items",
  tote_template: "Sets",
  case_template: "Procedures",
  movement: "Movements",
  calendar_block: "Events",
  task: "Tasks",
  note: "Notes",
  territory: "Territory",
  person: "People",
  place: "Places",
  asset: "Assets",
  document: "Documents",
  photo: "Photos",
};

interface Resolved {
  assignment: EntityTagAssignment;
  label: string;
  subtitle?: string;
}

/**
 * The payoff for tagging consistently: one tag, one screen, everything that
 * carries it, across every kind of record. Tags apply uniformly across
 * cases/items/facilities/surgeons precisely so this view can exist without
 * per-feature filter code — it's one query over entity_tag_assignments plus
 * the same label resolver the generic entity page already uses.
 */
export default function TagPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const [tag, setTag] = useState<TerritoryNoteTag | null | undefined>(undefined);
  const [rows, setRows] = useState<Resolved[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tagId) return;
    setLoading(true);
    Promise.all([getNoteTag(tagId), listEntitiesByTag(tagId)])
      .then(async ([t, assignments]) => {
        setTag(t);
        const resolved = await Promise.all(
          assignments.map(async (assignment) => {
            const label = await getEntityLabel(assignment.entity_type, assignment.entity_id).catch(() => null);
            return { assignment, label: label?.title ?? "(deleted record)", subtitle: label?.subtitle };
          }),
        );
        setRows(resolved);
      })
      .finally(() => setLoading(false));
  }, [tagId]);

  if (!tagId) return null;

  const byType = new Map<GraphEntityType, Resolved[]>();
  for (const r of rows) {
    const list = byType.get(r.assignment.entity_type) ?? [];
    list.push(r);
    byType.set(r.assignment.entity_type, list);
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <Link to="/" className="text-sm text-slate-500 underline">
        ← Home
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <Tag className="h-5 w-5 text-sky-400" />
        <h1 className="text-2xl font-bold text-slate-100">
          {loading ? "Loading…" : (tag?.name ?? "Unknown tag")}
        </h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {loading ? "" : `${rows.length} record${rows.length === 1 ? "" : "s"} tagged`}
      </p>

      {!loading && rows.length === 0 && (
        <p className="mt-8 text-slate-500">Nothing carries this tag yet.</p>
      )}

      <div className="mt-5 space-y-6">
        {[...byType.entries()].map(([type, items]) => (
          <section key={type}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {TYPE_LABEL[type] ?? type} ({items.length})
            </h2>
            <div className="mt-2 space-y-1.5">
              {items.map((r) => (
                <Link
                  key={r.assignment.id}
                  to={`/entity/${r.assignment.entity_type}/${r.assignment.entity_id}`}
                  className="block rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5 active:bg-slate-800"
                >
                  <p className="truncate text-sm font-medium text-slate-100">{r.label}</p>
                  {r.subtitle && <p className="truncate text-xs text-slate-500">{r.subtitle}</p>}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
