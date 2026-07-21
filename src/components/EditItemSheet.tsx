import { useState } from "react";
import { deleteInventoryItem, updateCatalogItemName, updateInventoryItem } from "../lib/api";
import type { DeliveryStatus, Facility, InventoryItem, SterilizationStatus } from "../lib/types";
import NotesSection from "./NotesSection";
import RenameField from "./RenameField";
import WikiLinkButton from "./WikiLinkButton";

/**
 * Fix or delete an inventory item — the escape hatch for typos during bulk
 * entry. Name is locked when the item is linked to a catalog entry (its
 * identity comes from there); everything else is editable.
 */
export default function EditItemSheet({
  item,
  facilities,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  facilities: Facility[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [lot, setLot] = useState(item.lot_number ?? "");
  const [expiration, setExpiration] = useState(item.expiration_date ?? "");
  const [quantity, setQuantity] = useState(item.quantity);
  const [locationId, setLocationId] = useState(item.location_id);
  const [cement, setCement] = useState<"cemented" | "cementless" | null>(item.cement_type);
  const [sterilization, setSterilization] = useState<SterilizationStatus>(item.sterilization_status);
  const [sterilExpires, setSterilExpires] = useState(item.sterilization_expires_at ?? "");
  const [delivery, setDelivery] = useState<DeliveryStatus | "">(item.delivery_status ?? "");
  const [deliveryDate, setDeliveryDate] = useState(item.expected_delivery_date ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const linked = !!item.catalog_item_id;

  async function onSave() {
    setSaving(true);
    try {
      await updateInventoryItem(item.id, {
        name: name.trim() || item.name,
        lot_number: lot.trim() || null,
        expiration_date: expiration || null,
        quantity,
        location_id: locationId,
        cement_type: item.category === "implant" ? cement : null,
        ...(item.category === "instrument_tray"
          ? { sterilization_status: sterilization, sterilization_expires_at: sterilExpires || null }
          : {}),
        ...(item.acquisition_type === "loaner"
          ? { delivery_status: delivery || null, expected_delivery_date: deliveryDate || null }
          : {}),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await deleteInventoryItem(item.id);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-white">Edit item</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Name {linked && <span className="text-slate-500">(from catalog — rename below)</span>}
            </label>
            {linked ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5">
                <RenameField
                  value={name}
                  textClassName="text-white"
                  onSave={async (next) => {
                    await updateCatalogItemName(item.catalog_item_id as string, next);
                    setName(next);
                  }}
                />
              </div>
            ) : (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white"
              />
            )}
          </div>

          {linked && (
            <WikiLinkButton
              entityType="catalog_item"
              entityId={item.catalog_item_id as string}
              title={name}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Lot number</label>
              <input
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Expiration</label>
              <input
                type="date"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Quantity</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                  className="h-11 w-11 rounded-lg bg-slate-800 text-xl text-white"
                >
                  −
                </button>
                <span className="w-8 text-center text-lg font-medium text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="h-11 w-11 rounded-lg bg-slate-800 text-xl text-white"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {item.category === "implant" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Cement</label>
              <div className="flex gap-2">
                {(
                  [
                    { v: null, l: "N/A" },
                    { v: "cemented", l: "Cemented" },
                    { v: "cementless", l: "Cementless" },
                  ] as { v: "cemented" | "cementless" | null; l: string }[]
                ).map((opt) => (
                  <button
                    key={opt.l}
                    onClick={() => setCement(opt.v)}
                    className={`flex-1 rounded-lg py-3 font-medium ${
                      cement === opt.v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.category === "instrument_tray" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Sterilization</label>
                <select
                  value={sterilization}
                  onChange={(e) => setSterilization(e.target.value as SterilizationStatus)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
                >
                  <option value="unknown">Not tracked</option>
                  <option value="sterile">Sterile</option>
                  <option value="processing">Processing</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Sterile until</label>
                <input
                  type="date"
                  value={sterilExpires}
                  onChange={(e) => setSterilExpires(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
                />
              </div>
            </div>
          )}

          {item.acquisition_type === "loaner" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Delivery</label>
                <select
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value as DeliveryStatus | "")}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
                >
                  <option value="">Not tracked</option>
                  <option value="ordered">Ordered</option>
                  <option value="in_transit">In transit</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Expected arrival</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white"
                />
              </div>
            </div>
          )}

          <NotesSection entityType="inventory_item" entityId={item.id} />

          <button
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-950/60 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          {confirmingDelete ? (
            <div className="rounded-lg border border-red-800 bg-red-950/30 p-3">
              <p className="text-sm text-red-200">
                Delete this item for good?{item.loaner_code ? " (Its tote contents go too.)" : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-lg bg-slate-800 py-2.5 font-medium text-white"
                >
                  Keep
                </button>
                <button
                  onClick={onDelete}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-red-700 py-2.5 font-medium text-white disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full text-sm text-red-400 underline"
            >
              Delete item
            </button>
          )}
          <button onClick={onClose} className="w-full text-sm text-slate-500 underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
