import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { linkEntities, listEntityLinks, unlinkEntities } from "../lib/api";
import type { EntityLink, GraphEntityType } from "../lib/types";

export interface LinkCandidate {
  id: string;
  label: string;
}

const TYPE_LABEL: Record<GraphEntityType, string> = {
  case: "Case",
  inventory_item: "Item",
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

const RELATIONS = ["related", "used_in", "located_at", "part_of", "assigned_to"];

function otherSide(link: EntityLink, entityType: GraphEntityType, entityId: string) {
  const isFrom = link.from_type === entityType && link.from_id === entityId;
  return isFrom ? { type: link.to_type, id: link.to_id } : { type: link.from_type, id: link.from_id };
}

/**
 * The general graph, made usable: shows every entity_links edge touching
 * this record, and lets a rep draw a new one — case to person, item to
 * asset, whatever the candidates map offers. `candidates` comes from the
 * caller because every screen already has its own record lists loaded
 * (facilities, surgeons, cases…); re-fetching them here would just be a
 * second round trip for data already in memory one component up.
 */
export default function EntityLinkPicker({
  entityType,
  entityId,
  candidates,
}: {
  entityType: GraphEntityType;
  entityId: string;
  candidates: Partial<Record<GraphEntityType, LinkCandidate[]>>;
}) {
  const { profile } = useAuth();
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [picking, setPicking] = useState(false);
  const [targetType, setTargetType] = useState<GraphEntityType | "">("");
  const [targetId, setTargetId] = useState("");
  const [relation, setRelation] = useState("related");
  const [busy, setBusy] = useState(false);

  const availableTypes = (Object.keys(candidates) as GraphEntityType[]).filter(
    (t) => (candidates[t]?.length ?? 0) > 0,
  );

  function refresh() {
    listEntityLinks(entityType, entityId)
      .then(setLinks)
      .catch(() => setLinks([]));
  }

  useEffect(refresh, [entityType, entityId]);

  function labelFor(type: GraphEntityType, id: string): string {
    return candidates[type]?.find((c) => c.id === id)?.label ?? `${TYPE_LABEL[type]} record`;
  }

  async function addLink() {
    if (!profile || !targetType || !targetId) return;
    setBusy(true);
    try {
      await linkEntities({
        from_type: entityType,
        from_id: entityId,
        to_type: targetType,
        to_id: targetId,
        relation,
        territory_id: profile.territory_id,
        created_by: profile.id,
      });
      setPicking(false);
      setTargetType("");
      setTargetId("");
      setRelation("related");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(linkId: string) {
    setBusy(true);
    try {
      await unlinkEntities(linkId);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((l) => {
            const other = otherSide(l, entityType, entityId);
            return (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-300">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">
                    {l.relation.replace(/_/g, " ")} · {labelFor(other.type, other.id)}
                  </span>
                </span>
                <button onClick={() => remove(l.id)} disabled={busy} aria-label="Remove link">
                  <X className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {picking ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as GraphEntityType);
              setTargetId("");
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">Link to…</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>

          {targetType && (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Which {TYPE_LABEL[targetType].toLowerCase()}…</option>
              {candidates[targetType]?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap gap-1.5">
            {RELATIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRelation(r)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  relation === r ? "bg-sky-600 text-white" : "border border-slate-700 text-slate-400"
                }`}
              >
                {r.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPicking(false)}
              className="flex-1 rounded-lg bg-slate-800 py-2 text-sm text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={addLink}
              disabled={busy || !targetType || !targetId}
              className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Link
            </button>
          </div>
        </div>
      ) : (
        availableTypes.length > 0 && (
          <button
            onClick={() => setPicking(true)}
            className="mt-2 flex items-center gap-1 rounded-full border border-dashed border-slate-700 px-2.5 py-1 text-xs text-slate-500 active:bg-slate-800"
          >
            <Link2 className="h-3 w-3" /> Link
          </button>
        )
      )}
    </div>
  );
}
