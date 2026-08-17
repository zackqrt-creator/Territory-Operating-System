import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getEntityLabel } from "../lib/api";
import type { GraphEntityType, NoteEntityType } from "../lib/types";
import EntityLinkPicker from "../components/EntityLinkPicker";
import EntityTags from "../components/EntityTags";
import EntityTimeline from "../components/EntityTimeline";
import NotesSection from "../components/NotesSection";

const TYPE_LABEL: Record<GraphEntityType, string> = {
  case: "Case",
  inventory_item: "Inventory item",
  surgeon: "Surgeon",
  facility: "Facility",
  catalog_item: "Catalog item",
  tote_template: "Set",
  case_template: "Procedure",
  movement: "Movement",
  calendar_block: "Event",
  task: "Task",
  note: "Note",
  territory: "Territory",
  person: "Person",
  place: "Place",
  asset: "Asset",
  document: "Document",
  photo: "Photo",
};

/** Every entity type NotesSection accepts — same restriction it always had. */
const NOTABLE_TYPES = new Set<GraphEntityType>([
  "case",
  "inventory_item",
  "surgeon",
  "facility",
  "catalog_item",
  "tote_template",
  "case_template",
  "movement",
  "calendar_block",
  "task",
  "note",
  "territory",
]);

/**
 * The one permalink every record in the app now has, whether or not its own
 * feature gives it a URL. A case only otherwise exists inside a modal sheet;
 * tapping a link chip that points at one needs somewhere to land, and this is
 * it. Shows the same tags/links/timeline/notes blocks every feature screen
 * already renders, generically, off nothing but the (type, id) in the URL.
 */
export default function EntityPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [label, setLabel] = useState<{ title: string; subtitle?: string } | null | undefined>(undefined);

  const entityType = type as GraphEntityType;

  useEffect(() => {
    if (!type || !id) return;
    setLabel(undefined);
    getEntityLabel(entityType, id)
      .then(setLabel)
      .catch(() => setLabel(null));
  }, [type, id, entityType]);

  if (!type || !id) return null;

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <Link to="/" className="text-sm text-slate-500 underline">
        ← Home
      </Link>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {TYPE_LABEL[entityType] ?? type}
      </p>

      {label === undefined ? (
        <p className="mt-1 text-slate-400">Loading…</p>
      ) : label === null ? (
        <p className="mt-1 text-slate-400">
          No detail view for this record yet — it may have been deleted, or this is a record type
          that doesn't have a page of its own.
        </p>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">{label.title}</h1>
          {label.subtitle && <p className="mt-0.5 text-sm text-slate-400">{label.subtitle}</p>}
        </>
      )}

      <EntityTags entityType={entityType} entityId={id} />

      <EntityLinkPicker entityType={entityType} entityId={id} candidates={{}} />

      {NOTABLE_TYPES.has(entityType) && (
        <NotesSection entityType={entityType as NoteEntityType} entityId={id} />
      )}

      <EntityTimeline entityType={entityType} entityId={id} />
    </div>
  );
}
