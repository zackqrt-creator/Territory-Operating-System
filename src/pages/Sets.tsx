import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  listFacilities,
  listToteTemplatesWithItems,
  listTrackedAssets,
  moveAsset,
  updateToteTemplateName,
  updateTrackedAsset,
} from "../lib/api";
import type { AssetStatus, Facility, ToteTemplateWithItems, TrackedAsset } from "../lib/types";
import TrayPhotos from "../components/TrayPhotos";
import { formatDateShort } from "../utils/dates";
import RenameField from "../components/RenameField";
import WikiLinkButton from "../components/WikiLinkButton";

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
