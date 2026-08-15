import { useEffect, useRef, useState } from "react";
import { Camera, Layers, X } from "lucide-react";
import { addAssetPhoto, deleteAssetPhoto, listAssetPhotos } from "../lib/api";
import type { AssetPhoto, AssetPhotoKind } from "../lib/types";

/**
 * How a tray was packed, so it can be put back that way.
 *
 * Instruments sit in molded slots and have to be returned to the exact slot
 * they came from. This is the record of that: one shot of the outside label
 * (which tray is this) and one per layer, top down (where everything goes).
 *
 * Used wherever the tray already exists as a row — a tracked KA One set, a
 * loaner tote being looked at later. The intake flow stages its photos as
 * files instead, because there is no row to attach them to yet.
 *
 * Nothing here forces the camera. A rep in a corridor often cannot stop to
 * shoot; they photograph it in the moment and attach it later, so the file
 * inputs offer the library as readily as the lens, and layers can be attached
 * several at a time.
 *
 * Hides itself if migration 049 has not been run, matching TaskPhotos. A
 * feature whose table does not exist yet should be absent, not an error the
 * rep has to interpret in the middle of doing something else.
 */
export default function TrayPhotos({
  inventoryItemId,
  trackedAssetId,
  toteTemplateId,
  territoryId,
  uploadedBy,
  title = "As it arrived",
  hint = "Put every piece back where it is in these photos.",
}: {
  inventoryItemId?: string;
  trackedAssetId?: string;
  /** A Set/Tote template's own reference photos, not tied to one physical unit. */
  toteTemplateId?: string;
  territoryId: string;
  uploadedBy?: string | null;
  title?: string;
  hint?: string;
}) {
  const [photos, setPhotos] = useState<AssetPhoto[]>([]);
  const [zoomed, setZoomed] = useState<AssetPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLInputElement>(null);

  const layerCount = photos.filter((p) => p.kind === "layer").length;

  function reload() {
    listAssetPhotos({ inventoryItemId, trackedAssetId, toteTemplateId })
      .then((rows) => {
        setPhotos(rows);
        setAvailable(true);
      })
      .catch(() => setAvailable(false));
  }

  useEffect(reload, [inventoryItemId, trackedAssetId, toteTemplateId]);

  if (!available) return null;

  /** Uploaded straight away: unlike intake, the tray already has a row. */
  async function onPicked(files: FileList | null, kind: AssetPhotoKind) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let next = layerCount;
      for (const file of picked) {
        await addAssetPhoto({
          inventoryItemId,
          trackedAssetId,
          toteTemplateId,
          file,
          territoryId,
          kind,
          layerIndex: kind === "layer" ? ++next : null,
          uploadedBy,
        });
      }
      reload();
    } catch {
      setError("Upload failed — try again, or attach it later.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(p: AssetPhoto) {
    try {
      await deleteAssetPhoto(p.id);
      setZoomed(null);
      reload();
    } catch {
      setError("Could not remove that photo.");
    }
  }

  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {photos.length > 0 ? hint : "No layout photos yet — add them any time."}
      </p>

      {photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button key={p.id} type="button" onClick={() => setZoomed(p)} className="relative block">
              <img
                src={p.url}
                alt={p.kind === "label" ? "Tray label" : `Layer ${p.layer_index}`}
                className="h-24 w-full rounded-lg border border-slate-700 object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-200">
                {p.kind === "label" ? "Label" : `Layer ${p.layer_index}`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => labelRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm font-medium text-slate-300 disabled:opacity-50"
        >
          <Camera size={15} /> Label photo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => layerRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-2.5 text-sm font-medium text-sky-300 disabled:opacity-50"
        >
          <Layers size={15} /> Add layer {layerCount + 1}
        </button>
      </div>

      <input
        ref={labelRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onPicked(e.target.files, "label");
          e.target.value = "";
        }}
      />
      <input
        ref={layerRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onPicked(e.target.files, "layer");
          e.target.value = "";
        }}
      />

      {busy && <p className="mt-1.5 text-xs text-slate-500">Uploading…</p>}
      {error && (
        <p className="mt-1.5 rounded-lg border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-200">
          {error}
        </p>
      )}

      {zoomed && (
        <div
          /* Fully opaque: at anything less, the sheet behind shows through the
             photo you are trying to match a foam cutout against. */
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black p-4"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(null);
          }}
        >
          <img
            src={zoomed.url}
            alt={zoomed.kind === "label" ? "Tray label" : `Layer ${zoomed.layer_index}`}
            className="max-h-[80vh] w-full object-contain"
          />
          <p className="mt-3 text-sm text-slate-300">
            {zoomed.kind === "label" ? "Tray label" : `Layer ${zoomed.layer_index}`} · tap to close
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(zoomed);
            }}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
          >
            <X size={12} /> Remove this photo
          </button>
        </div>
      )}
    </div>
  );
}
