import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  createDayRequirement,
  deleteDayRequirement,
  listDayRequirements,
  listFacilities,
  listToteTemplatesWithItems,
  listTrackedAssets,
  moveAsset,
  updateDayRequirement,
  updateToteTemplateName,
  updateTrackedAsset,
} from "../lib/api";
import type {
  AssetStatus,
  DayRequirement,
  DayRequirementScaling,
  Facility,
  ItemCategory,
  ToteTemplateWithItems,
  TrackedAsset,
} from "../lib/types";
import TrayPhotos from "../components/TrayPhotos";
import { formatDateShort } from "../utils/dates";
import RenameField from "../components/RenameField";
import WikiLinkButton from "../components/WikiLinkButton";

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
};

const SURGERY_TYPE_LABEL: Record<DayRequirement["surgery_type"], string> = {
  KNEE: "Knee day",
  HIP: "Hip day",
  INSTRUMENT: "Instrument day",
  ANY: "Any surgery day",
};

const STATUS_META: Record<AssetStatus, { label: string; cls: string; dot: string }> = {
  available: { label: "Available", cls: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  at_hospital: { label: "At hospital", cls: "bg-sky-500/15 text-sky-300", dot: "bg-sky-400" },
  in_surgery: { label: "In surgery", cls: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
  awaiting_pickup: { label: "Awaiting pickup", cls: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
  sterile_processing: { label: "Sterile processing", cls: "bg-violet-500/15 text-violet-300", dot: "bg-violet-400" },
  in_transit: { label: "In transit", cls: "bg-slate-500/20 text-slate-300", dot: "bg-slate-400" },
};

const STATUS_ORDER: AssetStatus[] = [
  "available",
  "at_hospital",
  "in_surgery",
  "awaiting_pickup",
  "sterile_processing",
  "in_transit",
];

/**
 * KAONE sets + revision totes as physical, movable objects. Each shows its live
 * location, status, and next-available date; tapping one opens an editor that
 * records the move to the asset's history. The revision-tote rule ("always 2
 * available per surgery day") is surfaced up top as a live green/red check.
 */
export default function Sets() {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<TrackedAsset[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [templates, setTemplates] = useState<ToteTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TrackedAsset | null>(null);

  function refresh() {
    setLoading(true);
    return Promise.all([listTrackedAssets(), listFacilities(), listToteTemplatesWithItems()])
      .then(([a, f, t]) => {
        setAssets(a);
        setFacilities(f);
        setTemplates(t);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  const kaone = assets.filter((a) => a.kind === "kaone_set");
  const revision = assets.filter((a) => a.kind === "revision_tote");
  const revisionAvailable = revision.filter((a) => a.status === "available").length;
  const facilityName = (id: string | null) =>
    id ? (facilities.find((f) => f.id === id)?.name ?? "—") : null;

  return (
    <div className="min-h-screen px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold text-slate-100">Sets &amp; totes</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every KAONE set and revision tote, where it is right now, and when it's free again.
      </p>

      {/* Revision-tote rule check */}
      <div
        className={`mt-4 rounded-xl border p-3 ${
          revisionAvailable >= 2
            ? "border-emerald-800 bg-emerald-950/25"
            : "border-red-800 bg-red-950/30"
        }`}
      >
        <p className={`text-sm font-medium ${revisionAvailable >= 2 ? "text-emerald-300" : "text-red-300"}`}>
          {revisionAvailable >= 2 ? "✓" : "⚠"} {revisionAvailable} of 2 revision totes available
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Two revision totes must be available for every surgery day, no matter how many cases.
        </p>
      </div>

      {!loading && templates.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Set definitions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            What's in each set, and who it goes to — rename here, edit the rules on its page.
          </p>
          <div className="mt-2 space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3"
              >
                <div className="min-w-0">
                  <RenameField
                    value={t.name}
                    textClassName="font-medium text-slate-100"
                    onSave={async (next) => {
                      await updateToteTemplateName(t.id, next);
                      await refresh();
                    }}
                  />
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.tote_template_items.length} item{t.tote_template_items.length === 1 ? "" : "s"}
                    {t.reusable ? " · reusable instrument set" : ""}
                  </p>
                </div>
                <WikiLinkButton
                  entityType="tote_template"
                  entityId={t.id}
                  title={t.name}
                  label="Page"
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {profile && <DayRulesPanel territoryId={profile.territory_id} />}

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <>
          <Section
            title="KAONE sets"
            subtitle={`${kaone.filter((a) => a.status === "available").length} of ${kaone.length} available`}
            assets={kaone}
            facilityName={facilityName}
            onEdit={setEditing}
          />
          <Section
            title="Revision totes"
            subtitle={`${revisionAvailable} of ${revision.length} available`}
            assets={revision}
            facilityName={facilityName}
            onEdit={setEditing}
          />
        </>
      )}

      {editing && profile && (
        <MoveSheet
          asset={editing}
          facilities={facilities}
          territoryId={profile.territory_id}
          movedBy={profile.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * What goes in the car on any surgery day, independent of case count -- the
 * revision totes, and anything that scales with the day's side split rather
 * than being counted per case. Feeds Staging's day-line list directly; a
 * rule added here shows up there the next time that day is loaded.
 */
function DayRulesPanel({ territoryId }: { territoryId: string }) {
  const { profile } = useAuth();
  const [rules, setRules] = useState<DayRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    surgery_type: "KNEE" as DayRequirement["surgery_type"],
    category: "loaner_kit" as ItemCategory,
    name: "",
    scaling: "flat" as DayRequirementScaling,
    quantity: 1,
    note: "",
  });

  function refresh() {
    setLoading(true);
    return listDayRequirements()
      .then(setRules)
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetDraft() {
    setDraft({ surgery_type: "KNEE", category: "loaner_kit", name: "", scaling: "flat", quantity: 1, note: "" });
  }

  async function onAdd() {
    if (!draft.name.trim() || !profile) return;
    setBusy(true);
    try {
      await createDayRequirement({
        territory_id: territoryId,
        surgery_type: draft.surgery_type,
        category: draft.category,
        name: draft.name.trim(),
        scaling: draft.scaling,
        quantity: draft.quantity,
        note: draft.note.trim() || null,
      });
      setAdding(false);
      resetDraft();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(r: DayRequirement) {
    setBusy(true);
    try {
      await updateDayRequirement(r.id, {
        surgery_type: draft.surgery_type,
        category: draft.category,
        name: draft.name.trim() || r.name,
        scaling: draft.scaling,
        quantity: draft.quantity,
        note: draft.note.trim() || null,
      });
      setEditingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await deleteDayRequirement(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: DayRequirement) {
    setDraft({
      surgery_type: r.surgery_type,
      category: r.category,
      name: r.name,
      scaling: r.scaling,
      quantity: r.quantity,
      note: r.note ?? "",
    });
    setEditingId(r.id);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Day rules</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            What goes in the car once for the whole day, however many cases are on it.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => {
              resetDraft();
              setAdding(true);
            }}
            className="min-h-0 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white"
          >
            + Add rule
          </button>
        )}
      </div>

      {!loading && rules.length === 0 && !adding && (
        <p className="mt-2 text-xs text-slate-600">No day rules yet.</p>
      )}

      <div className="mt-2 space-y-2">
        {rules.map((r) =>
          editingId === r.id ? (
            <DayRuleForm
              key={r.id}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSave={() => onSaveEdit(r)}
              saveLabel="Save"
            />
          ) : (
            <div
              key={r.id}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-100">{r.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {SURGERY_TYPE_LABEL[r.surgery_type]} · {CATEGORY_LABEL[r.category]} ·{" "}
                    {r.scaling === "per_side_plus_one"
                      ? `case count per side + ${r.quantity}`
                      : `×${r.quantity} flat`}
                  </p>
                  {r.note && <p className="mt-0.5 text-xs text-slate-600">{r.note}</p>}
                </div>
                <span className="flex shrink-0 gap-2 text-xs">
                  <button onClick={() => startEdit(r)} className="text-sky-400 underline">
                    edit
                  </button>
                  <button onClick={() => onDelete(r.id)} disabled={busy} className="text-slate-600">
                    ✕
                  </button>
                </span>
              </div>
            </div>
          ),
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <DayRuleForm
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={onAdd}
            saveLabel="Add"
          />
        </div>
      )}
    </div>
  );
}

interface DayRuleDraft {
  surgery_type: DayRequirement["surgery_type"];
  category: ItemCategory;
  name: string;
  scaling: DayRequirementScaling;
  quantity: number;
  note: string;
}

function DayRuleForm({
  draft,
  setDraft,
  busy,
  onCancel,
  onSave,
  saveLabel,
}: {
  draft: DayRuleDraft;
  setDraft: (d: DayRuleDraft) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="rounded-xl border border-sky-800 bg-sky-950/20 p-3">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="e.g. Efficiency Tote or Revision Tote"
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={draft.surgery_type}
          onChange={(e) => setDraft({ ...draft, surgery_type: e.target.value as DayRequirement["surgery_type"] })}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
        >
          {(["KNEE", "HIP", "INSTRUMENT", "ANY"] as const).map((t) => (
            <option key={t} value={t}>
              {SURGERY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value as ItemCategory })}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
        >
          {(Object.keys(CATEGORY_LABEL) as ItemCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={draft.scaling}
          onChange={(e) => setDraft({ ...draft, scaling: e.target.value as DayRequirementScaling })}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
        >
          <option value="flat">Flat quantity for the day</option>
          <option value="per_side_plus_one">Per-side case count + buffer</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
          <span className="shrink-0 text-xs text-slate-500">
            {draft.scaling === "per_side_plus_one" ? "extra per side" : "quantity"}
          </span>
        </div>
      </div>
      {draft.scaling === "per_side_plus_one" && (
        <p className="mt-1.5 text-xs text-slate-500">
          Produces one line per side (Left/Right), counted from that day's cases, plus this many extra.
          E.g. 3 right + 2 left knees with a buffer of 1 → 4 Right, 3 Left.
        </p>
      )}
      <input
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="Note shown under the line (optional)"
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <div className="mt-2 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm text-slate-300">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={busy || !draft.name.trim()}
          className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  assets,
  facilityName,
  onEdit,
}: {
  title: string;
  subtitle: string;
  assets: TrackedAsset[];
  facilityName: (id: string | null) => string | null;
  onEdit: (a: TrackedAsset) => void;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <div className="mt-2 space-y-2">
        {assets.map((a) => {
          const meta = STATUS_META[a.status];
          const loc = facilityName(a.location_id);
          return (
            <button
              key={a.id}
              onClick={() => onEdit(a)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left active:bg-slate-800"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-100">
                  {a.code}
                  {a.label && a.label !== a.code ? (
                    <span className="ml-2 text-sm font-normal text-slate-500">{a.label}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-400">
                  {a.is_placeholder && !a.location_id ? (
                    <span className="text-amber-400">⚠ Location not set — tap to confirm</span>
                  ) : (
                    <>
                      📍 {loc ?? "Location unknown"}
                      {a.available_date ? ` · free ${formatDateShort(a.available_date)}` : ""}
                    </>
                  )}
                </p>
              </div>
              <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MoveSheet({
  asset,
  facilities,
  territoryId,
  movedBy,
  onClose,
  onSaved,
}: {
  asset: TrackedAsset;
  facilities: Facility[];
  territoryId: string;
  movedBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AssetStatus>(asset.status);
  const [locationId, setLocationId] = useState<string | null>(asset.location_id);
  const [availableDate, setAvailableDate] = useState(asset.available_date ?? "");
  const [code, setCode] = useState(asset.code);
  const [saving, setSaving] = useState(false);

  const dirtyCode = code.trim() && code.trim() !== asset.code;

  async function onSave() {
    setSaving(true);
    try {
      if (dirtyCode) await updateTrackedAsset(asset.id, { code: code.trim() });
      await moveAsset({
        asset,
        toLocation: locationId,
        status,
        availableDate: availableDate || null,
        movedBy,
        territoryId,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        <div className="mb-1 flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-lg font-semibold text-slate-100"
          />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Rename the code to match the real set/tote ID stamped on it.
        </p>

        {/* Same layout record as a loaner tray -- our own sets go back into
            their slots too, and whoever collects it may not be whoever packed it. */}
        <TrayPhotos trackedAssetId={asset.id} territoryId={territoryId} uploadedBy={movedBy} />

        <label className="mb-1 block text-sm text-slate-400">Status</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg py-2.5 text-sm font-medium ${
                status === s ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>

        <label className="mb-1 mt-4 block text-sm text-slate-400">Location</label>
        <select
          value={locationId ?? ""}
          onChange={(e) => setLocationId(e.target.value || null)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
        >
          <option value="">Unknown</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <label className="mb-1 mt-4 block text-sm text-slate-400">
          Next available (optional — e.g. day after surgery)
        </label>
        <input
          type="date"
          value={availableDate}
          onChange={(e) => setAvailableDate(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
        />

        <button
          onClick={onSave}
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & log move"}
        </button>
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
