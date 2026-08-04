import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, PackageCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { listCaseTemplatesWithItems, listToteTemplatesWithItems, receiveTote } from "../lib/api";
import type { AcquisitionType, Facility, ToteTemplateWithItems } from "../lib/types";
import { addDays, toISODate } from "../utils/dates";

/**
 * Put a whole tote on the shelf in one action.
 *
 * The ledger's problem was never the schema, it was data entry: 931 catalog
 * rows against 7 inventory rows, because adding a KA One Complete Tote meant
 * typing 74 lines. The template already knows what is inside -- 860 rows of
 * tote_template_items -- so receiving a tote should be picking one, saying
 * where it landed, and pressing a button.
 *
 * The name field is the part that matters and the part that is easy to get
 * wrong. Readiness matches a checklist line to stock by exact name; the TKA
 * checklist asks for "Complete Tote (Right)" while the template is called
 * "KA One Complete Tote". So the checklist's own vocabulary is offered as
 * one-tap chips, and picking one is what makes the case go green off real
 * counted stock rather than a manual tick.
 */
export default function ToteReceipt({
  facilities,
  territoryId,
  defaultLocationId,
  onCreated,
  onCancel,
}: {
  facilities: Facility[];
  territoryId: string;
  defaultLocationId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<ToteTemplateWithItems[]>([]);
  const [checklistNames, setChecklistNames] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [toteName, setToteName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocationId || facilities[0]?.id || "");
  const [acquisition, setAcquisition] = useState<AcquisitionType>("consignment");
  const [returnDeadline, setReturnDeadline] = useState(() => addDays(toISODate(new Date()), 14));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showContents, setShowContents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listToteTemplatesWithItems()
      .then(setTemplates)
      .catch(() => setTemplates([]));
    // The names the readiness checklists actually ask for. Container-ish
    // categories only -- an implant line is never satisfied by a whole tote.
    listCaseTemplatesWithItems()
      .then((cts) => {
        const names = new Set<string>();
        for (const ct of cts) {
          for (const line of ct.case_template_items) {
            if (line.category === "loaner_kit" || line.category === "instrument_tray") {
              names.add(line.name);
            }
          }
        }
        setChecklistNames([...names].sort());
      })
      .catch(() => setChecklistNames([]));
  }, []);

  const template = templates.find((t) => t.id === templateId) ?? null;

  // Until the rep edits it, the name tracks the chosen template rather than
  // going stale on a name they never typed.
  useEffect(() => {
    if (template && !nameTouched) setToteName(template.name);
  }, [template, nameTouched]);

  const lines = useMemo(
    () =>
      (template?.tote_template_items ?? [])
        .filter((i) => i.catalog_item)
        .sort(
          (a, b) =>
            (a.pack_layer ?? 99) - (b.pack_layer ?? 99) ||
            a.catalog_item.name.localeCompare(b.catalog_item.name),
        ),
    [template],
  );

  const includedUnits = lines
    .filter((l) => !skipped.has(l.id))
    .reduce((n, l) => n + l.quantity_per_tote, 0);

  function toggleSkip(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!template || !toteName.trim() || !locationId) return;
    setSaving(true);
    setError(null);
    try {
      await receiveTote({
        template,
        toteName: toteName.trim(),
        locationId,
        territoryId,
        acquisitionType: acquisition,
        returnDeadline: acquisition === "loaner" ? returnDeadline : null,
        movedBy: profile?.id ?? null,
        quantities: Object.fromEntries([...skipped].map((id) => [id, 0])),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-slate-400">
        Puts the tote and everything its template says is inside onto the shelf in one go.
      </p>

      <label className="block">
        <span className="text-xs font-medium text-slate-400">Tote</span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100"
        >
          <option value="">Pick a tote…</option>
          {templates.map((t) => {
            const units = t.tote_template_items.reduce((n, i) => n + i.quantity_per_tote, 0);
            return (
              <option key={t.id} value={t.id}>
                {t.name} ({units} item{units === 1 ? "" : "s"})
              </option>
            );
          })}
        </select>
      </label>

      {template && (
        <>
          <div>
            <span className="text-xs font-medium text-slate-400">Call it</span>
            <input
              value={toteName}
              onChange={(e) => {
                setToteName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="Name on the shelf"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
            />
            {checklistNames.length > 0 && (
              <>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Your checklists ask for these by name — tap one and this tote will answer that
                  line.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {checklistNames.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setToteName(n);
                        setNameTouched(true);
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${
                        toteName === n
                          ? "bg-sky-600 text-white"
                          : "border border-slate-700 bg-slate-800/60 text-slate-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Landed at</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-1">
            {(["consignment", "loaner"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAcquisition(a)}
                className={`flex-1 rounded-md py-2 text-xs font-medium ${
                  acquisition === a ? "bg-sky-600 text-white" : "text-slate-400"
                }`}
              >
                {a === "consignment" ? "Ours (consignment)" : "Loaner — goes back"}
              </button>
            ))}
          </div>

          {acquisition === "loaner" && (
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Ship back by</span>
              <input
                type="date"
                value={returnDeadline}
                onChange={(e) => setReturnDeadline(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => setShowContents((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-left text-sm text-slate-300"
          >
            {showContents ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            {lines.length} line{lines.length === 1 ? "" : "s"} · {includedUnits} item
            {includedUnits === 1 ? "" : "s"}
            {skipped.size > 0 && (
              <span className="ml-auto text-xs text-amber-400">{skipped.size} skipped</span>
            )}
          </button>

          {showContents && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-800 p-2">
              {lines.map((l) => {
                const off = skipped.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleSkip(l.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                      off ? "text-slate-600 line-through" : "text-slate-300"
                    }`}
                  >
                    <span className="w-6 shrink-0 tabular-nums text-slate-500">
                      {l.quantity_per_tote}x
                    </span>
                    <span className="truncate">{l.catalog_item.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !template || !toteName.trim() || !locationId}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <PackageCheck className="h-4 w-4" />
          {saving
            ? "Receiving…"
            : template
              ? `Receive ${includedUnits} item${includedUnits === 1 ? "" : "s"}`
              : "Receive tote"}
        </button>
      </div>
    </div>
  );
}
