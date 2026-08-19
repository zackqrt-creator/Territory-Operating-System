import { useState } from "react";
import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import {
  createCaseTemplate,
  createCaseTemplateItem,
  deleteCaseTemplate,
  deleteCaseTemplateItem,
  updateCaseTemplate,
  updateCaseTemplateItem,
} from "../lib/api";
import type { CaseTemplateItem, CaseTemplateWithItems, CaseVariant, ItemCategory, Side } from "../lib/types";

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
};

const SIDE_LABEL: Record<Side | "ANY", string> = {
  ANY: "Both sides",
  LEFT: "Left only",
  RIGHT: "Right only",
};

/**
 * Create or edit a case template -- what a case type actually needs.
 *
 * Every prior change to this list was a hand-written SQL migration, one per
 * procedure. Readiness, Staging, and Pack List all read case_template_items
 * to know what a case needs, so this is the one editor with the widest
 * blast radius in the app -- get a quantity wrong here and every case of
 * that type reports the wrong thing. Matching is by exact name against
 * inventory (same convention receiveTote's own comment documents), so a
 * typo here is also a typo readiness will never resolve.
 */
export default function CaseTemplateEditor({
  template,
  territoryId,
  onClose,
  onChanged,
}: {
  /** null = creating a new template. */
  template: CaseTemplateWithItems | null;
  territoryId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [altName, setAltName] = useState(template?.alt_name ?? "");
  const [code, setCode] = useState(template?.code ?? "");
  const [surgeryType, setSurgeryType] = useState<"KNEE" | "HIP">(template?.surgery_type ?? "KNEE");
  const [variant, setVariant] = useState<CaseVariant>(template?.variant ?? "total");
  const [lines, setLines] = useState<CaseTemplateItem[]>(template?.case_template_items ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirtyHeader, setDirtyHeader] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<ItemCategory>("implant");
  const [draftSide, setDraftSide] = useState<Side | "ANY">("ANY");

  const templateId = template?.id ?? null;

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

  async function saveHeader() {
    if (!name.trim()) return;
    await guard(async () => {
      const patch = {
        name: name.trim(),
        alt_name: altName.trim() || null,
        code: code.trim() || null,
        surgery_type: surgeryType,
        variant,
      };
      if (templateId) {
        await updateCaseTemplate(templateId, patch);
      } else {
        if (!territoryId) throw new Error("Still signing you in — give it a second and try again.");
        await createCaseTemplate({ ...patch, territory_id: territoryId });
      }
      setDirtyHeader(false);
      onChanged();
      if (!templateId) onClose();
    });
  }

  async function addLine() {
    if (!templateId || !draftName.trim()) return;
    await guard(async () => {
      const row = await createCaseTemplateItem({
        template_id: templateId,
        category: draftCategory,
        name: draftName.trim(),
        applies_to_side: draftSide,
      });
      setLines((prev) => [...prev, row]);
      setDraftName("");
      onChanged();
    });
  }

  async function setQty(lineId: string, qty: number) {
    if (qty <= 0) {
      await guard(async () => {
        await deleteCaseTemplateItem(lineId);
        setLines((prev) => prev.filter((l) => l.id !== lineId));
        onChanged();
      });
      return;
    }
    await guard(async () => {
      await updateCaseTemplateItem(lineId, { quantity: qty });
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity: qty } : l)));
      onChanged();
    });
  }

  async function removeTemplate() {
    if (!templateId) return;
    await guard(async () => {
      await deleteCaseTemplate(templateId);
      onChanged();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div
        className="flex items-center justify-between border-b border-slate-800 px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}
      >
        <h2 className="truncate text-lg font-semibold text-slate-100">
          {templateId ? name || "Procedure" : "New procedure"}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-h-0 shrink-0 rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-3">
        {error && (
          <p className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirtyHeader(true);
              }}
              placeholder="e.g. GMK Sphere Total Knee"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Short name <span className="text-slate-600">(optional)</span>
              </label>
              <input
                value={altName}
                onChange={(e) => {
                  setAltName(e.target.value);
                  setDirtyHeader(true);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                myOPS code <span className="text-slate-600">(optional)</span>
              </label>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setDirtyHeader(true);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 font-mono text-sm text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Joint</label>
            <div className="flex gap-1.5">
              {(["KNEE", "HIP"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSurgeryType(t);
                    setDirtyHeader(true);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    surgeryType === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {t === "KNEE" ? "Knee" : "Hip"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Variant</label>
            <div className="flex gap-1.5">
              {(["total", "partial"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setVariant(v);
                    setDirtyHeader(true);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize ${
                    variant === v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {(dirtyHeader || !templateId) && (
            <button
              onClick={saveHeader}
              disabled={busy || !name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Check size={15} /> {templateId ? "Save details" : "Create procedure"}
            </button>
          )}
        </div>

        {templateId && (
          <>
            <div className="mt-4 rounded-xl border border-sky-900 bg-sky-950/20 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-sky-300">
                Add a requirement
              </p>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Exact name, matched against inventory — e.g. Complete Tote (Right)"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value as ItemCategory)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                >
                  {(Object.keys(CATEGORY_LABEL) as ItemCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={draftSide}
                  onChange={(e) => setDraftSide(e.target.value as Side | "ANY")}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                >
                  {(["ANY", "LEFT", "RIGHT"] as const).map((s) => (
                    <option key={s} value={s}>
                      {SIDE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={addLine}
                disabled={busy || !draftName.trim()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              What it needs ({lines.length})
            </p>

            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Nothing required yet — add lines above.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {[...lines]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-100">{l.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {CATEGORY_LABEL[l.category]}
                          {l.applies_to_side !== "ANY" ? ` · ${SIDE_LABEL[l.applies_to_side]}` : ""}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setQty(l.id, l.quantity - 1)}
                          disabled={busy}
                          aria-label="One fewer"
                          className="min-h-0 rounded bg-slate-700 p-1.5 text-slate-300 active:bg-slate-600 disabled:opacity-50"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums text-slate-100">
                          {l.quantity}
                        </span>
                        <button
                          onClick={() => setQty(l.id, l.quantity + 1)}
                          disabled={busy}
                          aria-label="One more"
                          className="min-h-0 rounded bg-slate-700 p-1.5 text-slate-300 active:bg-slate-600 disabled:opacity-50"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => setQty(l.id, 0)}
                          disabled={busy}
                          aria-label="Remove requirement"
                          className="min-h-0 rounded p-1.5 text-slate-500 active:bg-slate-700 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-8 border-t border-slate-800 pt-4">
              {confirmingDelete ? (
                <div className="rounded-lg border border-red-900 bg-red-950/30 p-3">
                  <p className="text-sm text-red-200">
                    Delete "{name}" and all {lines.length} of its requirements? Cases already using
                    it keep their history, but nothing will check them against this template anymore.
                    This can't be undone.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-slate-300"
                    >
                      Keep it
                    </button>
                    <button
                      onClick={removeTemplate}
                      disabled={busy}
                      className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Delete procedure
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmingDelete(true)} className="text-sm text-red-400/80">
                  Delete this procedure
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
