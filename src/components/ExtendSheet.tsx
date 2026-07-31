import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { extendLoanerReturn } from "../lib/api";
import type { InventoryItem } from "../lib/types";
import { addDays, toISODate } from "../utils/dates";

export default function ExtendSheet({
  item,
  defaultUntil,
  defaultReason,
  relatedCaseId,
  onClose,
  onExtended,
}: {
  item: InventoryItem;
  defaultUntil?: string;
  defaultReason?: string;
  relatedCaseId?: string;
  onClose: () => void;
  onExtended: () => void;
}) {
  const { profile } = useAuth();
  const [until, setUntil] = useState(defaultUntil ?? addDays(toISODate(new Date()), 2));
  const [reason, setReason] = useState(defaultReason ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (!profile || !reason.trim()) return;
    setSaving(true);
    try {
      await extendLoanerReturn({
        itemId: item.id,
        until,
        reason: reason.trim(),
        movedBy: profile.id,
        territoryId: profile.territory_id,
        relatedCaseId,
      });
      onExtended();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-100">Extend return</h2>
        <p className="text-sm text-slate-400">{item.name}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">New return-by date</label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this staying out past 48 hours?"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <button
            onClick={onSubmit}
            disabled={saving || !reason.trim()}
            className="w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm extension"}
          </button>
          <button onClick={onClose} className="w-full text-sm text-slate-500 underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
