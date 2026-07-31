import { useRef, useState } from "react";
import { Camera, ScanLine, Trash2 } from "lucide-react";
import { createConsignmentRestock, uploadItemPhoto } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import PackingSlipScan, { type SlipContentLine } from "./PackingSlipScan";
import type { CatalogItem, Facility } from "../lib/types";

/**
 * Consignment restock intake.
 *
 * Restock shipments arrive with the same paper slip as a loaner kit, but they
 * mean something different: this is stock replacing what surgeries earlier in
 * the week already consumed. So the lines become ordinary consignment rows
 * that roll into on-hand totals, rather than contents of a tote that has to go
 * back.
 */
export default function RestockIntake({
  facilities,
  catalog,
  territoryId,
  defaultLocationId,
  onCreated,
  onCancel,
}: {
  facilities: Facility[];
  catalog: CatalogItem[];
  territoryId: string;
  defaultLocationId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const [locationId, setLocationId] = useState(defaultLocationId || facilities[0]?.id || "");
  const [lines, setLines] = useState<SlipContentLine[]>([]);
  const [shipmentNo, setShipmentNo] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  function onPhotoSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function save() {
    if (!territoryId || !locationId || lines.length === 0) return;
    setSaving(true);
    try {
      await createConsignmentRestock({
        territoryId,
        locationId,
        shipmentNo,
        movedBy: profile?.id ?? null,
        photoUrl: photoFile ? await uploadItemPhoto(photoFile, territoryId) : null,
        lines: lines.map((l) => ({
          catalog_item_id: l.catalog_item_id,
          name: l.name,
          category: l.category,
          quantity: l.quantity,
          lot_number: l.lot_number,
          expiration_date: l.expiration_date,
        })),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">
        Scanning opens the camera and reads box barcodes as you point at them — one
        after another, with the lot and expiry exactly as printed. Photo only
        attaches an image without reading it.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-3 text-sm font-medium text-sky-300"
        >
          <ScanLine size={15} /> Scan boxes
        </button>
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm font-medium text-slate-300"
        >
          <Camera size={15} /> {photoFile ? "Replace photo" : "Photo only"}
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onPhotoSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {photoPreview && (
        <img
          src={photoPreview}
          alt="Shipment"
          className="h-28 w-full rounded-lg border border-slate-700 object-cover"
        />
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-400">Stocking location</label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {shipmentNo && (
        <p className="text-xs text-slate-500">
          Shipment <span className="font-mono text-slate-400">{shipmentNo}</span>
        </p>
      )}

      {lines.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-4 text-center">
          <p className="text-sm text-slate-400">
            Scan the boxes you just received, or the slip that came with them.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            These go in as ordinary consignment stock — scanning them just records
            that today's shipment replaced what earlier cases used.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">
            {lines.length} line{lines.length === 1 ? "" : "s"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"}
          </p>
          {lines.map((l, i) => (
            <div
              key={`${l.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">{l.name}</span>
                {l.lot_number && (
                  <span className="font-mono text-[11px] text-slate-500">Lot {l.lot_number}</span>
                )}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">×{l.quantity}</span>
              <button
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove line"
                className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-700"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || lines.length === 0 || !locationId}
          className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : `Stock ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`}
        </button>
      </div>

      {scanning && (
        <PackingSlipScan
          catalog={catalog}
          onClose={() => setScanning(false)}
          onConfirm={(slipLines, shipment, photo) => {
            // Appended, not replaced: a rep who closes the scanner and reopens
            // it to catch three boxes they missed should not lose the first
            // twelve. Same product and lot merges into one line.
            setLines((prev) => {
              const merged = [...prev];
              for (const line of slipLines) {
                const at = merged.findIndex(
                  (l) => l.name === line.name && l.lot_number === line.lot_number,
                );
                if (at === -1) merged.push(line);
                else merged[at] = { ...merged[at], quantity: merged[at].quantity + line.quantity };
              }
              return merged;
            });
            if (shipment) setShipmentNo(shipment);
            // The scan photo doubles as the shipment photo -- no reason to make
            // them take a second one.
            if (photo && !photoFile) onPhotoSelected(photo);
            setScanning(false);
          }}
        />
      )}
    </div>
  );
}
