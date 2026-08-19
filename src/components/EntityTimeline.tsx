import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { listEntityEvents } from "../lib/api";
import type { EntityEvent, GraphEntityType } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";

const VERB_LABEL: Record<string, string> = {
  created: "Created",
  status_changed: "Status changed",
  completed: "Completed",
  items_consumed: "Items used",
  moved: "Moved",
  credential_added: "Credential added",
  page_updated: "Knowledge page updated",
  assigned: "Reassigned",
};

function describe(e: EntityEvent): string {
  const label = VERB_LABEL[e.verb] ?? e.verb;
  if (e.verb === "status_changed" && typeof e.payload.status === "string") {
    return `${label} to ${e.payload.status}`;
  }
  if (e.verb === "items_consumed" && typeof e.payload.lineCount === "number") {
    return `${label} — ${e.payload.lineCount} line${e.payload.lineCount === 1 ? "" : "s"} (${e.payload.source ?? "scan"})`;
  }
  if (e.verb === "credential_added" && typeof e.payload.vendor === "string") {
    return `${label} — ${e.payload.vendor}`;
  }
  return label;
}

/**
 * Every logged action against one record, newest first. Reads straight off
 * entity_events — the same append-only log every write path in the app now
 * feeds — so this list grows automatically as more actions get instrumented,
 * with no per-feature timeline code required.
 */
export default function EntityTimeline({
  entityType,
  entityId,
}: {
  entityType: GraphEntityType;
  entityId: string;
}) {
  const [events, setEvents] = useState<EntityEvent[]>([]);

  useEffect(() => {
    listEntityEvents(entityType, entityId)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [entityType, entityId]);

  if (events.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Activity className="h-3.5 w-3.5" /> Activity
      </p>
      <div className="mt-1.5 space-y-1">
        {events.map((e) => (
          <p key={e.id} className="text-xs text-slate-400">
            <span className="text-slate-600">{formatRelativeDay(e.occurred_at)}</span> · {describe(e)}
          </p>
        ))}
      </div>
    </div>
  );
}
