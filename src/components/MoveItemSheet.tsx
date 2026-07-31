import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { moveItem } from "../lib/api";
import type { Facility, InventoryItem } from "../lib/types";

export default function MoveItemSheet({
  item,
  facilities,
  initialTarget,
  relatedCaseId,
  onClose,
  onMoved,
  onEdit,
}: {
  item: InventoryItem;
  facilities: Facility[];
  /** Skips the destination-picking step, e.g. a readiness-checklist quick-fix. */
  initialTarget?: Facility;
  relatedCaseId?: string;
  onClose: () => void;
  onMoved: () => void;
  /** When provided, shows an "Edit details / delete" link (e.g. from Inventory). */
  onEdit?: () => void;
}) {
  const { profile } = useAuth();
  const [target, setTarget] = useState<Facility | null>(initialTarget ?? null);
  const [saving, setSaving] = useState(false);

  const currentFacility = facilities.find((f) => f.id === item.location_id);
  const destinations = facilities.filter((f) => f.id !== item.location_id);

  async function confirmMove() {
    if (!target || !profile) return;
    setSaving(true);
    try {
      await moveItem({
        item,
        toLocation: target.id,
        movedBy: profile.id,
        territoryId: profile.territory_id,
        relatedCaseId,
        returningToCorporate: target.type === "corporate",
      });
      onMoved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl p-5 pb-8"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-100">{item.name}</h2>
        <p className="text-sm text-slate-400">Currently at {currentFacility?.name ?? "unknown"}</p>

        {!target ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {destinations.map((f) => (
              <button
                key={f.id}
                onClick={() => setTarget(f)}
                className="rounded-lg bg-slate-800 py-4 font-medium text-slate-100 active:bg-slate-700"
              >
                {f.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-slate-200">
              Move to <span className="font-semibold text-slate-100">{target.name}</span>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTarget(null)}
                className="flex-1 rounded-lg bg-slate-800 py-3 font-medium text-slate-100"
              >
                Back
              </button>
              <button
                onClick={confirmMove}
                disabled={saving}
                className="flex-1 rounded-lg bg-sky-600 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving ? "Moving..." : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {onEdit && !target && (
          <button onClick={onEdit} className="mt-4 w-full text-sm text-sky-400 underline">
            Edit details / delete
          </button>
        )}
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
