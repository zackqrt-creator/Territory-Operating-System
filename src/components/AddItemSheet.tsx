import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createInventoryItem } from "../lib/api";
import type { Facility, ItemCategory } from "../lib/types";

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "loaner_kit", label: "Loaner kit" },
  { value: "instrument_tray", label: "Instrument tray" },
  { value: "implant", label: "Implant" },
  { value: "consumable", label: "Consumable" },
];

export default function AddItemSheet({
  facilities,
  prefillBarcode,
  onClose,
  onCreated,
}: {
  facilities: Facility[];
  prefillBarcode?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("loaner_kit");
  const [lot, setLot] = useState("");
  const [barcode, setBarcode] = useState(prefillBarcode ?? "");
  const [locationId, setLocationId] = useState(profile?.last_facility_id ?? facilities[0]?.id ?? "");
  const [returnDeadline, setReturnDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (!name.trim() || !locationId || !profile) return;
    setSaving(true);
    try {
      await createInventoryItem({
        name: name.trim(),
        category,
        lot_number: lot.trim() || null,
        barcode_value: barcode.trim() || null,
        location_id: locationId,
        loaner_return_deadline: returnDeadline || null,
        territory_id: profile.territory_id,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-white">Add inventory item</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GMK Total Knee Loaner Kit"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg py-3 font-medium ${
                    category === c.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Lot number (optional)</label>
            <input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Barcode value (optional)</label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
            />
          </div>

          {category === "loaner_kit" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Return deadline (optional)</label>
              <input
                type="date"
                value={returnDeadline}
                onChange={(e) => setReturnDeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
              />
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={saving || !name.trim() || !locationId}
            className="w-full rounded-lg bg-sky-600 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add item"}
          </button>
          <button onClick={onClose} className="w-full text-sm text-slate-500 underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
