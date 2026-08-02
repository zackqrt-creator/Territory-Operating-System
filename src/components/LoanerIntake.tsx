import { useEffect, useMemo, useRef, useState } from "react";
import { createLoanerTote, type LoanerContentLine } from "../lib/api";
import { Camera, Layers, ScanLine, X } from "lucide-react";
import { addAssetPhoto, listToteTemplatesWithItems, uploadItemPhoto } from "../lib/api";
import { PackingSlipScan } from "./scanners";
import type { SlipContentLine } from "./PackingSlipScan";
import type {
  AssetPhotoKind,
  CatalogItem,
  Facility,
  ItemCategory,
  ToteTemplateWithItems,
} from "../lib/types";

/** One tray photo staged locally, before the tote row exists to attach it to. */
interface TrayShot {
  key: string;
  kind: AssetPhotoKind;
  /** 1-based, top layer first. Null for the label shot. */
  layerIndex: number | null;
  file: File;
  preview: string;
}

interface Line extends LoanerContentLine {
  key: string;
}

function itemLabel(c: CatalogItem): string {
  const parts = [c.name];
  if (c.side && c.side !== "NA") parts.push(c.side === "LEFT" ? "L" : "R");
  if (c.size_label) parts.push(c.size_label);
  return parts.join(" · ");
}

/**
 * Loaner tote intake: outer code + inner label + itemized contents that roll
 * into per-size/side totals. "Quick fill" buttons add a full same-side set of
 * a device in one tap (matches how a loaner tote actually arrives — one of
 * every size), so a 25-piece insert tote is a couple taps, not 25 rows.
 */
export default function LoanerIntake({
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
  const [loanerCode, setLoanerCode] = useState("");
  const [contentsLabel, setContentsLabel] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId || facilities[0]?.id || "");
  const [returnDeadline, setReturnDeadline] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [freeText, setFreeText] = useState("");
  const [freeCategory, setFreeCategory] = useState<ItemCategory>("instrument_tray");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  /*
   * A loaner tray goes back into its molded slots exactly as it arrived, and
   * intake is the only moment that layout is still authoritative. So this is a
   * set of shots rather than one: the outside label (which tray is this) and
   * one per layer, top down (where everything goes). A two-layer tray is three
   * photos.
   *
   * They are held as files, not uploaded on pick: the tote row does not exist
   * until createLoanerTote runs, and there is nothing to attach them to before
   * that. Uploading here would orphan them if the rep backs out.
   */
  const [shots, setShots] = useState<TrayShot[]>([]);
  const labelRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLInputElement>(null);
  const labelShot = shots.find((s) => s.kind === "label") ?? null;
  const layerCount = shots.filter((s) => s.kind === "layer").length;
  // The myOPS Sets already loaded into the catalog. A kit that arrives without
  // paper can still be filled in from the Set it is supposed to be.
  const [toteTemplates, setToteTemplates] = useState<ToteTemplateWithItems[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");

  useEffect(() => {
    listToteTemplatesWithItems().then(setToteTemplates).catch(() => {});
  }, []);

  /**
   * Loads a Set's official item list. This is what the Set *should* contain --
   * unlike a scanned slip, which is what was actually shipped -- so lines land
   * without lot numbers and are expected to be edited down to what is really
   * in the box.
   */
  function applyTemplate(t: ToteTemplateWithItems) {
    setLines(
      t.tote_template_items.map((ti) => ({
        key: `tpl-${ti.id}`,
        catalog_item_id: ti.catalog_item_id,
        name: ti.catalog_item?.name ?? "Item",
        category: ti.catalog_item?.category ?? "implant",
        quantity: ti.quantity_per_tote ?? 1,
        lot_number: null,
      })),
    );
    if (!contentsLabel.trim()) setContentsLabel(t.name);
    if (!loanerCode.trim() && t.code) setLoanerCode(t.code);
    setTemplateSearch("");
  }

  /** Re-shooting the label replaces it; layers append in the order taken. */
  function addShot(file: File | null, kind: AssetPhotoKind) {
    if (!file) return;
    setShots((prev) => {
      const next =
        kind === "label"
          ? prev.filter((s) => {
              if (s.kind !== "label") return true;
              URL.revokeObjectURL(s.preview);
              return false;
            })
          : [...prev];
      return [
        ...next,
        {
          key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          kind,
          layerIndex: kind === "layer" ? next.filter((s) => s.kind === "layer").length + 1 : null,
          file,
          preview: URL.createObjectURL(file),
        },
      ];
    });
  }

  /** Removing a layer renumbers the rest, so layer 2 never goes missing. */
  function removeShot(key: string) {
    setShots((prev) => {
      const gone = prev.find((s) => s.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      let layer = 0;
      return prev
        .filter((s) => s.key !== key)
        .map((s) => (s.kind === "layer" ? { ...s, layerIndex: ++layer } : s));
    });
  }

  /** Slip lines replace whatever is staged -- rescanning should not double up. */
  function applySlip(slipLines: SlipContentLine[], shipmentNo: string | null) {
    setLines(
      slipLines.map((l, i) => ({
        key: `slip-${i}-${l.catalog_item_id ?? l.name}`,
        catalog_item_id: l.catalog_item_id,
        name: l.name,
        category: l.category,
        quantity: l.quantity,
        lot_number: l.lot_number,
        expiration_date: l.expiration_date,
      })),
    );
    if (shipmentNo && !loanerCode.trim()) setLoanerCode(shipmentNo);
    setScanning(false);
  }

  // Available "sets": each (device type + side) group of sized implants, so a
  // full same-side run can be dropped in with one tap.
  const sets = useMemo(() => {
    const groups = new Map<string, { label: string; items: CatalogItem[] }>();
    for (const c of catalog) {
      if (c.category !== "implant" || !c.size_label) continue;
      const side = c.side === "LEFT" ? "Left" : c.side === "RIGHT" ? "Right" : "";
      const device = c.device_type ?? "Implant";
      const key = `${device}|${c.side}`;
      const label = `${side} ${device}`.trim();
      const g = groups.get(key) ?? { label, items: [] };
      g.items.push(c);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);

  function addItem(c: CatalogItem, qty = 1) {
    setLines((prev) => {
      const existing = prev.find((l) => l.catalog_item_id === c.id);
      if (existing) {
        return prev.map((l) => (l.catalog_item_id === c.id ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [
        ...prev,
        { key: c.id, catalog_item_id: c.id, name: c.name, category: c.category, quantity: qty },
      ];
    });
  }

  function addSet(items: CatalogItem[]) {
    for (const c of items) addItem(c, 1);
  }

  /*
   * Anything can end up in a tray. A hospital throws in an extra rasp, a
   * ReVLite tray comes with a piece that was never catalogued, corporate
   * substitutes a part mid-shipment. The catalog is a convenience, not a
   * gate -- contents rows already allow a null catalog_item_id and carry the
   * REF in the name, so an off-catalog line is a first-class row rather than
   * a workaround.
   */
  function addFreeText() {
    const name = freeText.trim();
    if (!name) return;
    setLines((prev) => [
      ...prev,
      {
        key: `adhoc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        catalog_item_id: null,
        name,
        category: freeCategory,
        quantity: 1,
      },
    ]);
    setFreeText("");
  }

  /** Any line can be renamed, catalogued or not -- labels get read wrong. */
  function renameLine(key: string, name: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, name } : l)));
  }

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      prev.flatMap((l) => (l.key === key ? (qty <= 0 ? [] : [{ ...l, quantity: qty }]) : [l])),
    );
  }

  function onSearchPick(value: string) {
    setSearch(value);
    const match = catalog.find((c) => itemLabel(c) === value);
    if (match) {
      addItem(match, 1);
      setSearch("");
    }
  }

  async function onSubmit() {
    if (!loanerCode.trim() || !locationId || !territoryId) return;
    setSaving(true);
    try {
      const tote = await createLoanerTote({
        loanerCode: loanerCode.trim(),
        contentsLabel: contentsLabel.trim() || null,
        locationId,
        territoryId,
        returnDeadline: returnDeadline || null,
        // The label shot doubles as the kit's thumbnail, so the item still
        // shows a picture everywhere inventory items already do.
        photoUrl: labelShot ? await uploadItemPhoto(labelShot.file, territoryId) : null,
        contents: lines.map(
          ({ catalog_item_id, name, category, quantity, lot_number, expiration_date }) => ({
            catalog_item_id,
            name,
            category,
            quantity,
            // Typed by hand these would not be worth the effort, but a barcode
            // or slip hands them over for free, so they are kept when we have
            // them -- expiry is what drives the expiring-lot warnings.
            lot_number: lot_number ?? null,
            expiration_date: expiration_date ?? null,
          }),
        ),
      });

      /*
       * Photos after the tote exists, sequentially so layer order survives.
       * A failure here must not read as "the tote did not save" -- it did, and
       * the contents are the part that matters, so this is reported separately
       * rather than thrown.
       */
      try {
        for (const shot of shots) {
          await addAssetPhoto({
            file: shot.file,
            territoryId,
            inventoryItemId: tote.id,
            kind: shot.kind,
            layerIndex: shot.layerIndex,
          });
        }
      } catch {
        setPhotoError("Kit saved, but the photos did not upload. Add them from the loaner's page.");
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">
        Scanning opens the camera and reads each box's barcode as you point at it —
        the lot and expiry come through exactly as printed. The photo buttons just
        attach images: shoot them now, or pick ones you took earlier.
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
          onClick={() => labelRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm font-medium text-slate-300"
        >
          <Camera size={15} /> {labelShot ? "Replace label" : "Label photo"}
        </button>
        <input
          ref={labelRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            addShot(e.target.files?.[0] ?? null, "label");
            e.target.value = "";
          }}
        />
      </div>

      {/*
       * The layout shots. This tray has to go back into its molded slots
       * exactly as it came, and right now is the only time that layout is
       * still correct -- once instruments start coming out, the reference is
       * gone. One shot per layer, top down.
       */}
      <div>
        <button
          type="button"
          onClick={() => layerRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-3 text-sm font-medium text-sky-300"
        >
          <Layers size={15} /> Add layer {layerCount + 1}
        </button>
        <input
          ref={layerRef}
          type="file"
          accept="image/*"
          // Layers shot earlier can be attached in one pass rather than one
          // at a time, which is the whole point of allowing a later upload.
          multiple
          className="hidden"
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) addShot(f, "layer");
            e.target.value = "";
          }}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {layerCount === 0
            ? "One per layer, before anything comes out. Shoot now or attach photos you took earlier."
            : `${layerCount} layer${layerCount === 1 ? "" : "s"} captured. Add another if the tray has one.`}
        </p>
      </div>

      {shots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shots.map((s) => (
            <div key={s.key} className="relative">
              <img
                src={s.preview}
                alt={s.kind === "label" ? "Label" : `Layer ${s.layerIndex}`}
                className="h-24 w-full rounded-lg border border-slate-700 object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-200">
                {s.kind === "label" ? "Label" : `Layer ${s.layerIndex}`}
              </span>
              <button
                type="button"
                onClick={() => removeShot(s.key)}
                aria-label={`Remove ${s.kind === "label" ? "label" : `layer ${s.layerIndex}`} photo`}
                className="absolute right-1 top-1 rounded-full bg-slate-950/80 p-1 text-slate-300"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {photoError && (
        <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-2.5 text-xs text-amber-200">
          {photoError}
        </p>
      )}

      {toteTemplates.length > 0 && (
        <div>
          <label className="mb-1 block text-sm text-slate-400">
            Or start from a Set{" "}
            <span className="text-slate-500">(what it should contain)</span>
          </label>
          <input
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            placeholder="GSKAIMPL, 500KATRL, Revision..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          {templateSearch.trim().length > 0 && (
            <div className="mt-1 max-h-44 space-y-1 overflow-y-auto">
              {toteTemplates
                .filter((t) => {
                  const q = templateSearch.trim().toLowerCase();
                  return (
                    t.name.toLowerCase().includes(q) ||
                    (t.code ?? "").toLowerCase().includes(q)
                  );
                })
                .slice(0, 12)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-2 text-left active:bg-slate-700"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-100">{t.name}</span>
                      {t.code && (
                        <span className="font-mono text-[11px] text-slate-500">{t.code}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {t.tote_template_items.length} items
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-400">Loaner code (outside of the tote)</label>
        <input
          autoFocus
          value={loanerCode}
          onChange={(e) => setLoanerCode(e.target.value)}
          placeholder="SPKAEFFR08"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-medium uppercase tracking-wide text-slate-100 placeholder:text-slate-500 placeholder:normal-case"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">What's inside (plain name)</label>
        <input
          value={contentsLabel}
          onChange={(e) => setContentsLabel(e.target.value)}
          placeholder="Ins-Spherika Efficiency Right"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Return by (optional)</label>
          <input
            type="date"
            value={returnDeadline}
            onChange={(e) => setReturnDeadline(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
          />
        </div>
      </div>

      <div className="rounded-lg border border-sky-800 bg-sky-950/20 p-3">
        <p className="text-xs font-medium text-sky-200">Quick fill a full set (one of every size)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {sets.map((s) => (
            <button
              key={s.label}
              onClick={() => addSet(s.items)}
              className="rounded-full bg-sky-900/60 px-3 py-1.5 text-xs font-medium text-sky-200 active:bg-sky-800"
            >
              + {s.label} ×{s.items.length}
            </button>
          ))}
          {sets.length === 0 && (
            <p className="text-xs text-slate-500">
              No sized implants in the catalog yet — add contents by search below.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Add a single item</label>
        <input
          list="loaner-catalog"
          value={search}
          onChange={(e) => onSearchPick(e.target.value)}
          placeholder="Search catalog by size/side..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
        />
        <datalist id="loaner-catalog">
          {catalog.map((c) => (
            <option key={c.id} value={itemLabel(c)} />
          ))}
        </datalist>
      </div>

      {/*
        Not everything that ends up in a tray is in the catalog -- a hospital
        throws in an extra rasp, a ReVLite tray ships with a piece nobody has
        catalogued, corporate substitutes a part mid-shipment. Typing it in has
        to be as ordinary as picking from the list, or the record quietly stops
        matching the tray.
      */}
      <div>
        <label className="mb-1 block text-sm text-slate-400">
          Not in the catalog? <span className="text-slate-500">Type it in</span>
        </label>
        <div className="flex gap-2">
          <input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFreeText();
              }
            }}
            placeholder="Extra rasp, ReVLite broach handle..."
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={addFreeText}
            disabled={!freeText.trim()}
            className="shrink-0 rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(
            [
              ["instrument_tray", "Instrument"],
              ["implant", "Implant"],
              ["consumable", "Consumable"],
              ["loaner_kit", "Kit"],
            ] as [ItemCategory, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFreeCategory(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                freeCategory === value
                  ? "bg-sky-600 text-white"
                  : "border border-slate-700 bg-slate-800/60 text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="rounded-lg border border-slate-700">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-200">
              Contents · {totalUnits} unit{totalUnits === 1 ? "" : "s"}
            </span>
            <button onClick={() => setLines([])} className="text-xs text-slate-500 underline">
              Clear
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
            {lines.map((l) => {
              const c = catalog.find((x) => x.id === l.catalog_item_id);
              return (
                <div key={l.key} className="flex items-center justify-between gap-2 rounded-md bg-slate-800/60 px-2 py-1.5">
                  {/*
                    Every line is renamable, catalogued or not. A slip gets OCR'd
                    wrong, a catalog name does not match what is stencilled on
                    the tray, a rep wants "Sidhu's short broach" instead of a
                    REF. Tapping the name edits it.
                  */}
                  {editingKey === l.key ? (
                    <input
                      autoFocus
                      value={l.name}
                      onChange={(e) => renameLine(l.key, e.target.value)}
                      onBlur={() => setEditingKey(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingKey(null)}
                      className="min-w-0 flex-1 rounded border border-sky-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingKey(l.key)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-slate-200"
                    >
                      {/* Name truncates, badge does not -- an off-catalog line
                          is exactly the one you need to see is off-catalog. */}
                      <span className="truncate">{c ? itemLabel(c) : l.name}</span>
                      {!l.catalog_item_id && (
                        <span className="shrink-0 rounded bg-amber-950/60 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                          off-catalog
                        </span>
                      )}
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(l.key, l.quantity - 1)}
                      className="h-7 w-7 rounded-md bg-slate-700 text-slate-100"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm text-slate-100">{l.quantity}</span>
                    <button
                      onClick={() => setQty(l.key, l.quantity + 1)}
                      className="h-7 w-7 rounded-md bg-slate-700 text-slate-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={saving || !loanerCode.trim() || !locationId}
        className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-600/25 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Log loaner tote"}
      </button>
      <button onClick={onCancel} className="w-full text-sm text-slate-500 underline">
        Cancel
      </button>
      {scanning && (
        <PackingSlipScan
          catalog={catalog}
          onClose={() => setScanning(false)}
          onConfirm={(slipLines, shipment, photo) => {
            if (photo && !labelShot) addShot(photo, "label");
            applySlip(slipLines, shipment);
          }}
        />
      )}
    </div>
  );
}
