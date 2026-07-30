import { useState } from "react";
import { Check, X } from "lucide-react";
import { createCatalogItem, deleteCatalogItem, updateCatalogItem } from "../lib/api";
import NotesSection from "./NotesSection";
import type { CatalogItem, CatalogJoint, CatalogSide, CementType, ItemCategory } from "../lib/types";

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "implant", label: "Implant" },
  { value: "consumable", label: "Efficiency" },
  { value: "instrument_tray", label: "Instrument tray" },
  { value: "loaner_kit", label: "Loaner kit" },
];

const JOINTS: { value: CatalogJoint; label: string }[] = [
  { value: "KNEE", label: "Knee" },
  { value: "HIP", label: "Hip" },
  { value: "NA", label: "Neither" },
];

const SIDES: { value: CatalogSide; label: string }[] = [
  { value: "LEFT", label: "Left" },
  { value: "RIGHT", label: "Right" },
  { value: "NA", label: "Either" },
];

const CEMENTS: { value: CementType; label: string }[] = [
  { value: "cemented", label: "Cemented" },
  { value: "cementless", label: "Cementless" },
  { value: "NA", label: "N/A" },
];

/**
 * Create or edit a catalog product.
 *
 * Only the name was editable before, via an inline rename -- which meant a REF
 * typo'd during an import, or a GTIN learned against the wrong product, was
 * permanent. Everything a scan or a pack list matches on is here: REF, GTIN,
 * side, size, cement, product line.
 *
 * Deleting is refused (with a count) while on-hand stock or a Set still points
 * at the row, since cascading that would quietly destroy real inventory.
 */
export default function CatalogItemEditor({
  item,
  territoryId,
  onClose,
  onChanged,
}: {
  /** null = creating a new product. */
  item: CatalogItem | null;
  /** Null while the signed-in profile is still loading, or missing. */
  territoryId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [itemNumber, setItemNumber] = useState(item?.item_number ?? "");
  const [gtin, setGtin] = useState(item?.gtin ?? "");
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? "implant");
  const [joint, setJoint] = useState<CatalogJoint>(item?.joint ?? "KNEE");
  const [side, setSide] = useState<CatalogSide>(item?.side ?? "NA");
  const [sizeLabel, setSizeLabel] = useState(item?.size_label ?? "");
  const [deviceType, setDeviceType] = useState(item?.device_type ?? "");
  const [productLine, setProductLine] = useState(item?.product_line ?? "");
  const [cement, setCement] = useState<CementType>(item?.cement_type ?? "NA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!name.trim()) return;
    await guard(async () => {
      const patch = {
        name: name.trim(),
        item_number: itemNumber.trim() || null,
        gtin: gtin.replace(/\D/g, "") || null,
        category,
        joint,
        side,
        size_label: sizeLabel.trim() || null,
        device_type: deviceType.trim() || null,
        product_line: productLine.trim() || null,
        cement_type: cement,
      };
      if (item) {
        await updateCatalogItem(item.id, patch);
      } else {
        if (!territoryId) throw new Error("Still signing you in — give it a second and try again.");
        await createCatalogItem({ ...patch, territory_id: territoryId });
      }
      onChanged();
      onClose();
    });
  }

  async function remove() {
    if (!item) return;
    await guard(async () => {
      await deleteCatalogItem(item.id);
      onChanged();
      onClose();
    });
  }

  function Choice<T extends string>({
    label,
    value,
    options,
    onPick,
  }: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onPick: (v: T) => void;
  }) {
    return (
      <div>
        <label className="mb-1 block text-xs text-slate-400">{label}</label>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onPick(o.value)}
              className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium ${
                value === o.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div
        className="flex items-center justify-between border-b border-slate-800 px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}
      >
        <h2 className="truncate text-lg font-semibold text-white">
          {item ? "Edit product" : "New product"}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-h-0 shrink-0 rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-32 pt-3">
        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GMK Tibial Tray Cemented"
            className={field}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">REF / item number</label>
            <input
              value={itemNumber}
              onChange={(e) => setItemNumber(e.target.value.toUpperCase())}
              placeholder="02.12.3D03L"
              className={`${field} font-mono text-sm`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">GTIN</label>
            <input
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              inputMode="numeric"
              placeholder="07630345710819"
              className={`${field} font-mono text-sm`}
            />
          </div>
        </div>
        <p className="-mt-1 text-[11px] text-slate-600">
          Both are how a scan finds this product — the REF off printed text, the GTIN off the
          barcode.
        </p>

        <Choice label="Category" value={category} options={CATEGORIES} onPick={setCategory} />
        <Choice label="Joint" value={joint} options={JOINTS} onPick={setJoint} />
        <Choice label="Side" value={side} options={SIDES} onPick={setSide} />
        <Choice label="Cement" value={cement} options={CEMENTS} onPick={setCement} />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Size</label>
            <input
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
              placeholder="3"
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Device type</label>
            <input
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              placeholder="Tibial Tray"
              className={field}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Product line</label>
          <input
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
            placeholder="GMK Sphere"
            className={field}
          />
        </div>

        {item && (
          <NotesSection entityType="catalog_item" entityId={item.id} title="Notes on this product" />
        )}

        {item && (
          <div className="mt-6 border-t border-slate-800 pt-4">
            {confirmingDelete ? (
              <div className="rounded-lg border border-red-900 bg-red-950/30 p-3">
                <p className="text-sm text-red-200">
                  Delete "{item.name}" from the catalog? This can't be undone.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-slate-300"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={remove}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmingDelete(true)} className="text-sm text-red-400/80">
                Delete this product
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className="border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <button
          onClick={save}
          disabled={busy || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 py-3.5 text-lg font-semibold text-white shadow-lg shadow-sky-950/40 disabled:opacity-50"
        >
          <Check size={18} /> {busy ? "Saving…" : item ? "Save changes" : "Create product"}
        </button>
      </div>
    </div>
  );
}
