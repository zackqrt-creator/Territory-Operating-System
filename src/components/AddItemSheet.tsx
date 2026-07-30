import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createCatalogItem, createInventoryItem, listCatalogItems, uploadItemPhoto } from "../lib/api";
import type {
  CatalogItem,
  CatalogJoint,
  CatalogSide,
  CementType,
  Facility,
  ItemCategory,
} from "../lib/types";
import LoanerIntake from "./LoanerIntake";
import RestockIntake from "./RestockIntake";
import { ocrPage } from "../lib/ocr";
import { catalogLabel, parseGs1, parseLabelText } from "../lib/labelParse";

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "loaner_kit", label: "Loaner kit" },
  { value: "instrument_tray", label: "Instrument tray" },
  { value: "implant", label: "Implant" },
  { value: "consumable", label: "Efficiency" },
];

const JOINTS: { value: CatalogJoint; label: string }[] = [
  { value: "KNEE", label: "Knee" },
  { value: "HIP", label: "Hip" },
  { value: "NA", label: "Other" },
];

const SIDES: { value: CatalogSide; label: string }[] = [
  { value: "NA", label: "N/A" },
  { value: "LEFT", label: "Left" },
  { value: "RIGHT", label: "Right" },
];

const CEMENT_TYPES: { value: CementType; label: string }[] = [
  { value: "NA", label: "N/A" },
  { value: "cemented", label: "Cemented" },
  { value: "cementless", label: "Cementless" },
];

const OTHER = "__other__";

// Same controlled-vocabulary pattern for every joint, so knee and hip
// catalog entries come out formatted identically instead of one being
// curated (knee, seeded via migration) and the other free-typed (hip,
// entered live tomorrow). "Other" always falls back to free text.
const DEVICE_TYPES: Record<CatalogJoint, string[]> = {
  KNEE: ["Femoral Component", "Tibial Tray", "Tibial Insert", "Patella", "Instrument Tray", "Hardware"],
  HIP: [
    "Femoral Stem",
    "Acetabular Cup",
    "Liner",
    "Femoral Head",
    "Revision Femoral",
    "Revision Acetabular",
    "Bone Cement",
  ],
  NA: ["Efficiency General Kit", "Efficiency Tibial Tray", "Efficiency Femoral Component", "Hardware"],
};

const PRODUCT_LINES: Record<CatalogJoint, string[]> = {
  KNEE: ["GMK Spherika", "GMK Primary", "GMK Sphere Primary E-Cross", "Moto PFJ", "KA One", "GMK Revision"],
  HIP: [
    "Global Hip",
    "AMIStem-P",
    "Quadra-P",
    "SMS",
    "MasterLoc",
    "X-ACTA",
    "Versafitcup",
    "Mpact",
    "HighCross",
    "Bipolar Head",
    "M-Vizion Femoral Revision System",
    "AMIS-K Long",
    "QUADRA-R",
    "3D Metal B-Cage",
    "MectaCem-X",
  ],
  NA: [],
};

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
  const [mode, setMode] = useState<"consignment" | "loaner" | "restock">("consignment");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [joint, setJoint] = useState<CatalogJoint>("KNEE");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("loaner_kit");
  const [lot, setLot] = useState("");
  const [barcode, setBarcode] = useState(prefillBarcode ?? "");
  const [locationId, setLocationId] = useState(profile?.last_facility_id ?? facilities[0]?.id ?? "");
  const [returnDeadline, setReturnDeadline] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cementType, setCementType] = useState<"cemented" | "cementless" | null>(null);
  const [saving, setSaving] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [showNewCatalogForm, setShowNewCatalogForm] = useState(false);
  const [newDeviceTypeChoice, setNewDeviceTypeChoice] = useState("");
  const [newDeviceTypeOther, setNewDeviceTypeOther] = useState("");
  const [newProductLineChoice, setNewProductLineChoice] = useState("");
  const [newProductLineOther, setNewProductLineOther] = useState("");
  const [newSide, setNewSide] = useState<CatalogSide>("NA");
  const [newSizeLabel, setNewSizeLabel] = useState("");
  const [newCementType, setNewCementType] = useState<CementType>("NA");
  const [creatingCatalogItem, setCreatingCatalogItem] = useState(false);

  useEffect(() => {
    listCatalogItems().then(setCatalog);
  }, []);

  // A scanned data-matrix barcode is a GS1 UDI string, not a plain code — pull
  // lot (AI 10) and expiration (AI 17) straight out of it, since those AIs are
  // defined by the standard. Store the GTIN as the barcode value (cleaner and
  // stable) rather than the whole raw element string.
  useEffect(() => {
    if (!prefillBarcode) return;
    const gs1 = parseGs1(prefillBarcode);
    if (!gs1) return;
    if (gs1.lot) setLot((prev) => prev || gs1.lot!);
    if (gs1.expiration) setExpiration((prev) => prev || gs1.expiration!);
    if (gs1.gtin) setBarcode(gs1.gtin);
    setScanNote(
      `Read from barcode — lot ${gs1.lot ?? "?"}${gs1.expiration ? `, exp ${gs1.expiration}` : ""}. Pick the product and verify before saving.`,
    );
  }, [prefillBarcode]);

  const filteredCatalog = catalog.filter((c) => c.joint === joint);

  function onJointChange(value: CatalogJoint) {
    setJoint(value);
    setCatalogSearch("");
    setCatalogItemId(null);
    setShowNewCatalogForm(false);
    setNewDeviceTypeChoice("");
    setNewDeviceTypeOther("");
    setNewProductLineChoice("");
    setNewProductLineOther("");
  }

  function onCatalogSearchChange(value: string) {
    setCatalogSearch(value);
    const match = filteredCatalog.find((c) => catalogLabel(c) === value);
    if (match) {
      setCatalogItemId(match.id);
      setName(match.name);
      setCategory(match.category);
      setShowNewCatalogForm(false);
    } else {
      setCatalogItemId(null);
    }
  }

  function onPhotoSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  /**
   * Take/choose a photo of a label → OCR it on-device → pre-fill the form.
   * The photo is also attached to the item. Everything filled is a suggestion
   * the rep confirms; if OCR fails, the photo still attaches and nothing else
   * changes.
   */
  async function onScanLabel(file: File) {
    onPhotoSelected(file);
    setScanning(true);
    setScanNote(null);
    try {
      // The scorer lets OCR retry other orientations when the upright pass
      // reads nothing usable off a sideways photo. goodEnough: 1 stops at the
      // first orientation that reads anything at all, rather than packing-slip's
      // higher bar for a "clearly worked" dense page.
      const result = await ocrPage(file, (t) => parseLabelText(t, catalog).fieldsRead.length, undefined, {
        goodEnough: 1,
      });
      const scan = parseLabelText(result.text, catalog);
      if (scan.fieldsRead.length === 0) {
        setScanNote("Couldn't read the label clearly — fill it in by hand, the photo is attached.");
        return;
      }

      // Only claim a field in the note if it actually landed somewhere — the rep
      // reads this list to know what still needs typing.
      const filled: string[] = [];

      if (scan.match) {
        // Exact catalog hit: take identity from the catalog (authoritative),
        // including side/size, which the catalog states precisely where OCR only
        // guesses.
        setCatalogItemId(scan.match.id);
        setName(scan.match.name);
        setCategory(scan.match.category);
        if (scan.match.joint) setJoint(scan.match.joint);
        setCatalogSearch(catalogLabel(scan.match));
        setShowNewCatalogForm(false);
        filled.push("product");
      } else if (scan.refText || scan.gtin) {
        // No exact hit, so the rep confirms or creates. Seed the new-catalog
        // form with what the label says instead of reading those values off and
        // then discarding them.
        if (scan.refText) {
          setName((prev) => prev || `REF ${scan.refText}`);
          // The create-catalog action keys off this box, so seed it too —
          // otherwise the form opens with its create button disabled.
          setCatalogSearch((prev) => prev || `REF ${scan.refText}`);
        }
        const sizeLabel = scan.size ?? (scan.height ? `${scan.height}mm` : null);
        if (scan.side) {
          setNewSide(scan.side);
          filled.push("side");
        }
        if (sizeLabel) {
          setNewSizeLabel(sizeLabel);
          filled.push(scan.size ? "size" : "height");
        }
        if (scan.cement) setNewCementType(scan.cement);
        if (scan.side || sizeLabel || scan.cement) setShowNewCatalogForm(true);
      }

      // Unit-level facts — true for this box whether or not it linked to catalog.
      if (scan.gtin) {
        setBarcode((prev) => prev || scan.gtin!);
        filled.push("barcode");
      }
      if (scan.cement) {
        setCementType(scan.cement);
        filled.push("cement");
      }
      if (scan.lot) {
        setLot(scan.lot);
        filled.push("lot");
      }
      if (scan.expiration) {
        setExpiration(scan.expiration);
        filled.push("expiration");
      }

      const matchMsg = scan.match
        ? `Matched ${scan.match.name}${scan.match.size_label ? ` · ${scan.match.size_label}` : ""}. `
        : scan.refText
          ? `Read REF ${scan.refText} (no catalog match — confirm or add it). `
          : "";
      setScanNote(
        filled.length > 0
          ? `${matchMsg}Filled: ${filled.join(", ")}. Verify before saving.`
          : `${matchMsg}Nothing could be filled automatically — enter the details by hand.`,
      );
    } catch {
      setScanNote("Label scan unavailable right now — photo attached, fill it in by hand.");
    } finally {
      setScanning(false);
    }
  }

  async function onCreateCatalogItem() {
    if (!catalogSearch.trim() || !profile) return;
    const deviceType = newDeviceTypeChoice === OTHER ? newDeviceTypeOther.trim() : newDeviceTypeChoice;
    const productLine = newProductLineChoice === OTHER ? newProductLineOther.trim() : newProductLineChoice;
    setCreatingCatalogItem(true);
    try {
      const created = await createCatalogItem({
        name: catalogSearch.trim(),
        category,
        joint,
        device_type: deviceType || null,
        product_line: productLine || null,
        side: newSide,
        size_label: newSizeLabel.trim() || null,
        cement_type: newCementType,
        territory_id: profile.territory_id,
      });
      setCatalog((prev) => [...prev, created]);
      setCatalogItemId(created.id);
      setName(created.name);
      setShowNewCatalogForm(false);
    } finally {
      setCreatingCatalogItem(false);
    }
  }

  async function onSubmit() {
    if (!name.trim() || !locationId || !profile) return;
    setSaving(true);
    try {
      const photoUrl = photoFile ? await uploadItemPhoto(photoFile, profile.territory_id) : null;
      await createInventoryItem({
        name: name.trim(),
        category,
        lot_number: lot.trim() || null,
        barcode_value: barcode.trim() || null,
        location_id: locationId,
        loaner_return_deadline: returnDeadline || null,
        territory_id: profile.territory_id,
        catalog_item_id: catalogItemId,
        photo_url: photoUrl,
        expiration_date: expiration || null,
        acquisition_type: "consignment",
        cement_type: category === "implant" ? cementType : null,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-100">Add inventory</h2>

        <div className="mt-4 flex rounded-lg border border-slate-700 bg-slate-800/50 p-1">
          {(["consignment", "loaner", "restock"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setMode(a)}
              className={`flex-1 rounded-md py-2 text-xs font-medium ${
                mode === a ? "bg-sky-600 text-white" : "text-slate-400"
              }`}
            >
              {a === "consignment" ? "Consignment" : a === "loaner" ? "Loaner tote" : "Restock"}
            </button>
          ))}
        </div>

        {mode === "restock" ? (
          <RestockIntake
            facilities={facilities}
            catalog={catalog}
            territoryId={profile?.territory_id ?? ""}
            defaultLocationId={locationId}
            onCreated={onCreated}
            onCancel={onClose}
          />
        ) : mode === "loaner" ? (
          <LoanerIntake
            facilities={facilities}
            catalog={catalog}
            territoryId={profile?.territory_id ?? ""}
            defaultLocationId={locationId}
            onCreated={onCreated}
            onCancel={onClose}
          />
        ) : (
        <div className="mt-4 space-y-4">
          <div>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onScanLabel(f);
              }}
            />
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={scanning}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-700 bg-sky-950/40 px-4 py-3 font-medium text-sky-200 disabled:opacity-60"
            >
              {scanning ? "Reading label…" : "📷 Scan label to auto-fill"}
            </button>
            {scanNote && (
              <p className="mt-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-xs text-slate-300">
                {scanNote}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Snap the printed label — reads the REF, size, side, cement, lot &amp; expiration, and
              links it to the catalog. Always double-check before saving.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Joint</label>
            <div className="grid grid-cols-3 gap-2">
              {JOINTS.map((j) => (
                <button
                  key={j.value}
                  onClick={() => onJointChange(j.value)}
                  className={`rounded-lg py-2.5 font-medium ${
                    joint === j.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Photo (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
            />
            {photoPreview ? (
              <div className="flex items-center gap-3">
                <img src={photoPreview} alt="Item preview" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  onClick={() => {
                    onPhotoSelected(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-sm text-slate-500 underline"
                >
                  Remove photo
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-slate-700 bg-slate-800/50 px-4 py-3 text-slate-400"
              >
                📷 Take or choose a photo
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Match catalog item (optional)</label>
            <input
              list="catalog-options"
              value={catalogSearch}
              onChange={(e) => onCatalogSearchChange(e.target.value)}
              placeholder="Search by name, side, or size..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
            />
            <datalist id="catalog-options">
              {filteredCatalog.map((c) => (
                <option key={c.id} value={catalogLabel(c)} />
              ))}
            </datalist>
            {catalogItemId ? (
              <p className="mt-1 text-xs text-slate-500">
                Linked — this item's size will be used for the pack list.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Matching an existing catalog item pre-fills the name and links the size for the pack
                list. Don't see it?{" "}
                <button
                  onClick={() => setShowNewCatalogForm((v) => !v)}
                  disabled={!catalogSearch.trim()}
                  className="text-sky-400 underline disabled:opacity-40"
                >
                  Add "{catalogSearch.trim() || "..."}" as a new catalog item
                </button>
              </p>
            )}
          </div>

          {showNewCatalogForm && !catalogItemId && (
            <div className="space-y-3 rounded-lg border border-sky-800 bg-sky-950/20 p-3">
              <p className="text-xs text-sky-300">
                Creates a reusable catalog entry under {joint === "HIP" ? "Hips" : joint === "KNEE" ? "Knee" : "Other"}{" "}
                so future scans of this exact device match automatically.
              </p>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Device type</label>
                <select
                  value={newDeviceTypeChoice}
                  onChange={(e) => setNewDeviceTypeChoice(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="" disabled>
                    Select a device type...
                  </option>
                  {DEVICE_TYPES[joint].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value={OTHER}>Other (type below)</option>
                </select>
                {newDeviceTypeChoice === OTHER && (
                  <input
                    value={newDeviceTypeOther}
                    onChange={(e) => setNewDeviceTypeOther(e.target.value)}
                    placeholder="Custom device type"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Product line</label>
                <select
                  value={newProductLineChoice}
                  onChange={(e) => setNewProductLineChoice(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="" disabled>
                    Select a product line...
                  </option>
                  {PRODUCT_LINES[joint].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value={OTHER}>Other (type below)</option>
                </select>
                {newProductLineChoice === OTHER && (
                  <input
                    value={newProductLineOther}
                    onChange={(e) => setNewProductLineOther(e.target.value)}
                    placeholder="Custom product line"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Side</label>
                  <select
                    value={newSide}
                    onChange={(e) => setNewSide(e.target.value as CatalogSide)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  >
                    {SIDES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Size label</label>
                  <input
                    value={newSizeLabel}
                    onChange={(e) => setNewSizeLabel(e.target.value)}
                    placeholder="e.g. 50mm"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Cement type</label>
                <select
                  value={newCementType}
                  onChange={(e) => setNewCementType(e.target.value as CementType)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  {CEMENT_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={onCreateCatalogItem}
                disabled={creatingCatalogItem || !catalogSearch.trim()}
                className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {creatingCatalogItem ? "Creating..." : "Create catalog item"}
              </button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-400">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCatalogItemId(null);
              }}
              placeholder="GMK Total Knee Loaner Kit"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500"
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

          {category === "implant" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Cement (femurs)</label>
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
                    onClick={() => setCementType(opt.v)}
                    className={`flex-1 rounded-lg py-3 font-medium ${
                      cementType === opt.v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-400">Location</label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Lot number</label>
              <input
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Expiration</label>
              <input
                type="date"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Barcode value (optional)</label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
            />
          </div>

          {category === "loaner_kit" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Return deadline (optional)</label>
              <input
                type="date"
                value={returnDeadline}
                onChange={(e) => setReturnDeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
              />
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={saving || !name.trim() || !locationId}
            className="w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-600/25 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add item"}
          </button>
          <button onClick={onClose} className="w-full text-sm text-slate-500 underline">
            Cancel
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
