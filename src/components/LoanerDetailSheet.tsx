import { useEffect, useState } from "react";
import { listLoanerContents } from "../lib/api";
import type { Facility, InventoryItem } from "../lib/types";
import NotesSection from "./NotesSection";

/**
 * Tap a loaner tote to see what's inside it — the outer code (e.g. SPKAEFFR08)
 * plus the itemized contents that roll into your per-size totals.
 */
export default function LoanerDetailSheet({
  tote,
  facilities,
  onClose,
  onMove,
}: {
  tote: InventoryItem;
  facilities: Facility[];
  onClose: () => void;
  onMove: () => void;
}) {
  const [contents, setContents] = useState<InventoryItem[] | null>(null);

  useEffect(() => {
    listLoanerContents(tote.id).then(setContents);
  }, [tote.id]);

  const facilityName = facilities.find((f) => f.id === tote.location_id)?.name ?? "—";
  const totalUnits = contents?.reduce((sum, c) => sum + c.quantity, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-200">
            Loaner
          </span>
          <span className="font-mono text-sm tracking-wide text-slate-300">{tote.loaner_code}</span>
        </div>
        <h2 className="mt-1 text-lg font-semibold text-white">{tote.contents_label || tote.name}</h2>
        <p className="text-sm text-slate-400">
          {facilityName}
          {tote.loaner_return_deadline ? ` · return by ${tote.loaner_return_deadline}` : ""}
        </p>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Inside {contents ? `· ${totalUnits} unit${totalUnits === 1 ? "" : "s"}` : ""}
          </p>
          {contents === null ? (
            <p className="mt-2 text-sm text-slate-400">Loading…</p>
          ) : contents.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              No itemized contents logged for this tote.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {contents.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.name}</span>
                  <span className="ml-2 text-sm font-medium text-slate-300">×{c.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <NotesSection entityType="inventory_item" entityId={tote.id} />

        <button
          onClick={onMove}
          className="mt-5 w-full rounded-lg bg-slate-700 px-4 py-3 font-medium text-white"
        >
          Move / check out this tote
        </button>
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-500 underline">
          Close
        </button>
      </div>
    </div>
  );
}
