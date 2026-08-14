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
import ToteReceipt from "./ToteReceipt";
import { ocrPage } from "../lib/ocr";
import { catalogLabel, parseLabelText, prefillFromScan } from "../lib/labelParse";
import { useFrequentCatalog } from "../hooks/useFrequentCatalog";

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
  prefillPhoto,
  onClose,
  onCreated,
}: {
  facilities: Facility[];
  prefillBarcode?: string;
  /**
   * The photo the barcode was decoded from, when a scan opened this sheet.
   * It gets read a second time, for its printed text: the data-matrix carries
   * only GTIN, lot and expiry, while the product name, size, thickness, side
   * and cement are printed words beside it. Same photo, both readings — the
   * rep should not have to shoot the same label twice.
   */
  prefillPhoto?: File | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<"consignment" | "loaner" | "restock" | "tote">("consignment");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [joint, setJoint] = useState<CatalogJoint>("KNEE");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("loaner_kit");
  const [lot, setLot] = useState("");
  const [barcode, setBarcode] = useState(() =>
    prefillBarcode ? prefillFromScan(prefillBarcode).barcode : "",
  );
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
    listCatalogItems()
      .then(setCatalog)
      .finally(() => setCatalogLoaded(true));
  }, []);

  /*
   * A scanned data-matrix is a GS1 UDI string, not a plain code — lot (AI 10)
   * and expiry (AI 17) are encoded in it alongside the GTIN, so read all three.
   * The GTIN alone goes in the barcode field: it is stable and it is what the
   * lookup matches on.
   *
   * Waits for the catalog, because a GTIN we have seen before names the product
   * too — the same match Batch add already makes. Without it, a scan of a known
   * box still left the rep typing the name.
   *
   * Applied once per code (the ref), so re-rendering after the rep creates a
   * catalog item cannot overwrite what they have since typed.
   */
  const appliedScanRef = useRef<string | null>(null);
  /** What the data-matrix gave us — exact, and so it outranks OCR of the same box. */
  const barcodeScanRef = useRef<ReturnType<typeof prefillFromScan> | null>(null);
  useEffect(() => {
    if (!prefillBarcode || !catalogLoaded) return;
    if (appliedScanRef.current === prefillBarcode) return;
    appliedScanRef.current = prefillBarcode;

    const scan = prefillFromScan(prefillBarcode);
    barcodeScanRef.current = scan;
    const filled: string[] = [];

    setBarcode((prev) => prev || scan.barcode);
    if (scan.lot) {
      setLot((prev) => prev || scan.lot!);
      filled.push(`lot ${scan.lot}`);
    }
    if (scan.expiration) {
      setExpiration((prev) => prev || scan.expiration!);
      filled.push(`exp ${scan.expiration}`);
    }

    const match = catalog.find((c) => c.gtin === scan.barcode) ?? null;
    if (match) {
      setCatalogItemId(match.id);
      setName(match.name);
      setCategory(match.category);
      if (match.joint) setJoint(match.joint);
      setCatalogSearch(catalogLabel(match));
      filled.unshift(match.name);
    }

    setScanNote(
      filled.length > 0
        ? `Read from barcode: ${filled.join(", ")}.${prefillPhoto ? " Reading the printed label too…" : " Verify before saving."}`
        : "That code carries a GTIN and nothing else — no lot or expiry is encoded in it, and it doesn't match the catalog yet. Fill those in below, or use “Scan label to auto-fill” to read the printed label.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBarcode, catalog, catalogLoaded]);

  /*
   * ...and then read the same photo again, for the words.
   *
   * A data-matrix encodes three things: GTIN, lot, expiry. Everything the rep
   * actually reads off the box to know what it is -- "Moto Patella
   * Resurfacing", CEMENTED, SIZE 3, Ø 32mm, or SIZE 4 / RIGHT / THICKNESS
   * 10mm -- is printed text next to it and is in no barcode anywhere. Until
   * now that meant a scan filled three fields and the rep typed the rest,
   * or shot the very same label a second time through "Scan label to
   * auto-fill". Same photo, so: decode it, then OCR it.
   *
   * Runs after the barcode pass and never overwrites what that pass filled,
   * because a data-matrix is exact and OCR of small print on a shiny box is a
   * best effort.
   */
  const appliedPhotoRef = useRef<File | null>(null);
  useEffect(() => {
    if (!prefillPhoto || !catalogLoaded) return;
    if (appliedPhotoRef.current === prefillPhoto) return;
    appliedPhotoRef.current = prefillPhoto;
    void onScanLabel(prefillPhoto, { keepScanNote: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPhoto, catalogLoaded]);

  const frequent = useFrequentCatalog();
  // Same ordering as the tray picker: what we actually stock, first.
  const filteredCatalog = frequent.sort(catalog.filter((c) => c.joint === joint));

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
  async function onScanLabel(file: File, { keepScanNote = false } = {}) {
    onPhotoSelected(file);
    setScanning(true);
    if (!keepScanNote) setScanNote(null);
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
        setScanNote(
          keepScanNote
            ? "Barcode read, but the printed label wouldn't come off this photo — fill in the product and size by hand, or retake it square to the label."
            : "Couldn't read the label clearly — fill it in by hand, the photo is attached.",
        );
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
      } else {
        /*
         * No catalog hit, so the rep confirms or creates — and everything the
         * box states goes into that decision rather than being read and thrown
         * away. The name is what the label calls the device ("Moto Patella
         * Resurfacing"), not a bare REF, because a REF is unreadable at a
         * glance on a shelf and the printed words are the thing the rep is
         * looking at.
         */
        const label = scan.suggestedName ?? (scan.refText ? `REF ${scan.refText}` : null);
        if (label) {
          setName((prev) => prev || label);
          // The create-catalog action keys off this box, so seed it too —
          // otherwise the form opens with its create button disabled.
          setCatalogSearch((prev) => prev || label);
          filled.push(label);
        }

        /*
         * Knee or hip comes off the product family, which the parser tags,
         * because the label never prints either word. It has to be settled
         * before the two dropdowns below are seeded: they offer different
         * vocabularies per joint, and a value that is not in the list a
         * <select> is rendering silently shows as blank.
         */
        if (scan.joint) setJoint(scan.joint);
        const jointForLists: CatalogJoint = scan.joint ?? joint;

        if (scan.productLine) {
          setNewProductLineChoice(
            PRODUCT_LINES[jointForLists].includes(scan.productLine) ? scan.productLine : OTHER,
          );
          setNewProductLineOther(scan.productLine);
        }
        if (scan.deviceDescription) {
          setNewDeviceTypeChoice(
            DEVICE_TYPES[jointForLists].includes(scan.deviceDescription) ? scan.deviceDescription : OTHER,
          );
          setNewDeviceTypeOther(scan.deviceDescription);
        }
        if (scan.side) {
          setNewSide(scan.side);
          filled.push(scan.side === "LEFT" ? "side left" : "side right");
        }
        if (scan.suggestedSizeLabel) {
          setNewSizeLabel(scan.suggestedSizeLabel);
          filled.push(`size ${scan.suggestedSizeLabel}`);
        }
        if (scan.cement) setNewCementType(scan.cement);
        // Open the create form whenever there is enough on the label to make a
        // real catalog entry out of it.
        if (scan.productLine || scan.deviceDescription || scan.suggestedSizeLabel || scan.side) {
          setShowNewCatalogForm(true);
        }
      }

      // Unit-level facts — true for this box whether or not it linked to catalog.
      if (scan.gtin) {
        setBarcode((prev) => prev || scan.gtin!);
        filled.push("barcode");
      }
      if (scan.cement) {
        setCementType(scan.cement);
        filled.push(scan.cement === "cemented" ? "cemented" : "cementless");
      }
      /*
       * Never overwrite a lot or expiry that is already in the form. When the
       * same photo has been decoded as a barcode first, what is sitting there
       * came out of the data-matrix -- exact by construction -- and this is
       * OCR of small digits printed on a shiny box, which is not.
       */
      if (scan.lot) {
        setLot((prev) => prev || scan.lot!);
        filled.push(`lot ${scan.lot}`);
      }
      if (scan.expiration) {
        setExpiration((prev) => prev || scan.expiration!);
        filled.push(`exp ${scan.expiration}`);
      }

      /*
       * One line stating what this box is, merged across both readings, so the
       * rep checks the summary against the label in their hand rather than
       * against six separate form fields. The barcode's lot and expiry win
       * here for the same reason they win in the form.
       */
      const fromBarcode = barcodeScanRef.current;
      const summary = [
        scan.match ? scan.match.name : scan.suggestedName,
        scan.match?.size_label ? `size ${scan.match.size_label}` : null,
        !scan.match && scan.suggestedSizeLabel ? `size ${scan.suggestedSizeLabel}` : null,
        !scan.match && scan.side ? (scan.side === "LEFT" ? "left" : "right") : null,
        scan.insertType,
        scan.cement,
        (fromBarcode?.lot ?? scan.lot) ? `lot ${fromBarcode?.lot ?? scan.lot}` : null,
        (fromBarcode?.expiration ?? scan.expiration)
          ? `exp ${fromBarcode?.expiration ?? scan.expiration}`
          : null,
      ].filter(Boolean);

      const unmatched = !scan.match && scan.refText ? ` No catalog match for REF ${scan.refText} — confirm or add it below.` : "";
      setScanNote(
        summary.length > 0
          ? `Read: ${summary.join(" · ")}.${unmatched} Verify before saving.`
          : filled.length > 0
            ? `Filled: ${filled.join(", ")}.${unmatched} Verify before saving.`
            : `Nothing could be filled automatically — enter the details by hand.`,
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
          {(["consignment", "loaner", "restock", "tote"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setMode(a)}
              className={`flex-1 rounded-md py-2 text-xs font-medium ${
                mode === a ? "bg-sky-600 text-white" : "text-slate-400"
              }`}
            >
              {a === "consignment"
                ? "Consignment"
                : a === "loaner"
                  ? "Loaner tote"
                  : a === "restock"
                    ? "Receive"
                    : "Whole tote"}
            </button>
          ))}
        </div>

        {mode === "tote" ? (
          <ToteReceipt
            facilities={facilities}
            territoryId={profile?.territory_id ?? ""}
            defaultLocationId={locationId}
            onCreated={onCreated}
            onCancel={onClose}
          />
        ) : mode === "restock" ? (
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
              Snap the printed label — reads the product and REF, size, thickness or diameter,
              side, type, cement, lot &amp; expiration, and links it to the catalog. Always
              double-check before saving.
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
