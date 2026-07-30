import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search, Trash2, X } from "lucide-react";
import {
  addToteTemplateItem,
  createToteTemplate,
  deleteToteTemplate,
  deleteToteTemplateItem,
  updateToteTemplate,
  updateToteTemplateItem,
} from "../lib/api";
import type { CatalogItem, ToteTemplateWithItems } from "../lib/types";

function itemLabel(c: CatalogItem): string {
  const parts = [c.name];
  if (c.side && c.side !== "NA") parts.push(c.side === "LEFT" ? "Left" : "Right");
  if (c.size_label) parts.push(`Size ${c.size_label}`);
  return parts.join(" · ");
}

/**
 * Create or edit a Set -- the contents of one tray or tote.
 *
 * Sets originally only arrived by importing myOPS packing lists, which made
 * them read-only in practice: a territory's real trays drift from the
 * catalogue almost immediately (a complete tote gets split, a travelling
 * insert tray appears, revision sets get built locally), and there was no way
 * to say so. Everything here is editable, including deleting the Set outright.
 *
 * Contents are saved as they are edited rather than on a Save button. A tray
 * is checked against physical boxes on a bench, one at a time, and losing
 * twenty minutes of that to a mis-tap is not acceptable -- so each change is
 * its own small write. The header fields (name, code, type) do use Save,
 * because they are typed rather than tapped.
 */
export default function SetEditor({
  set,
  catalog,
  territoryId,
  onClose,
  onChanged,
}: {
  /** null = creating a new Set. */
  set: ToteTemplateWithItems | null;
  catalog: CatalogItem[];
  /** Null while the signed-in profile is still loading, or missing. */
  territoryId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(set?.name ?? "");
  const [code, setCode] = useState(set?.code ?? "");
  const [notes, setNotes] = useState(set?.notes ?? "");
  const [reusable, setReusable] = useState(set?.reusable ?? false);
  const [lines, setLines] = useState(set?.tote_template_items ?? []);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dirtyHeader, setDirtyHeader] = useState(false);

  // Until the Set exists there is nothing for contents to hang off, so a new
  // Set is created by its header first and then filled.
  const setId = set?.id ?? null;

  const inSet = useMemo(() => new Set(lines.map((l) => l.catalog_item_id)), [lines]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter(
        (c) =>
          !inSet.has(c.id) &&
          (c.name.toLowerCase().includes(q) ||
            (c.item_number ?? "").toLowerCase().includes(q) ||
            (c.product_line ?? "").toLowerCase().includes(q) ||
            (c.device_type ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 40);
  }, [catalog, search, inSet]);

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
        code: code.trim() || null,
        notes: notes.trim() || null,
        reusable,
      };
      if (setId) {
        await updateToteTemplate(setId, patch);
      } else {
        if (!territoryId) throw new Error("Still signing you in — give it a second and try again.");
        await createToteTemplate({ ...patch, territory_id: territoryId });
      }
      setDirtyHeader(false);
      onChanged();
      // A brand-new Set has no id here, so reopen it from the refreshed list
      // rather than guessing at one.
      if (!setId) onClose();
    });
  }

  async function addItem(c: CatalogItem) {
    if (!setId) {
      setError("Save the set's name first, then add items to it.");
      return;
    }
    await guard(async () => {
      const row = await addToteTemplateItem({
        tote_template_id: setId,
        catalog_item_id: c.id,
        quantity_per_tote: 1,
      });
      setLines((prev) => [...prev, { ...row, catalog_item: c }]);
      setSearch("");
      onChanged();
    });
  }

  async function setQty(lineId: string, qty: number) {
    if (qty <= 0) {
      await guard(async () => {
        await deleteToteTemplateItem(lineId);
        setLines((prev) => prev.filter((l) => l.id !== lineId));
        onChanged();
      });
      return;
    }
    await guard(async () => {
      await updateToteTemplateItem(lineId, { quantity_per_tote: qty });
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, quantity_per_tote: qty } : l)),
      );
      onChanged();
    });
  }

  async function removeSet() {
    if (!setId) return;
    await guard(async () => {
      await deleteToteTemplate(setId);
      onChanged();
      onClose();
    });
  }

  const products = lines.length;
  const pieces = lines.reduce((sum, l) => sum + (l.quantity_per_tote ?? 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div
        className="flex items-center justify-between border-b border-slate-800 px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}
      >
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">
            {setId ? name || "Set" : "New set"}
          </h2>
          {setId && (
            <p className="text-xs text-slate-500">
              {products} product{products === 1 ? "" : "s"} · {pieces} piece
              {pieces === 1 ? "" : "s"} in the tray
            </p>
          )}
        </div>
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
              placeholder="e.g. KA One Complete Tote"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-white placeholder:text-slate-500"
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
              placeholder="GSKAIMPL"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">What kind of tray</label>
            <div className="flex gap-1.5">
              {[
                { value: false, label: "Implants (per-case)" },
                { value: true, label: "Instruments (reusable)" },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    setReusable(opt.value);
                    setDirtyHeader(true);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    reusable === opt.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirtyHeader(true);
              }}
              rows={2}
              placeholder="Anything worth remembering about this tray"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>

          {(dirtyHeader || !setId) && (
            <button
              onClick={saveHeader}
              disabled={busy || !name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Check size={15} /> {setId ? "Save details" : "Create set"}
            </button>
          )}
        </div>

        {setId && (
          <>
            <div className="mt-4">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Search size={12} /> Add a product
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the catalog by name, REF or size"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
              />
              {search.trim() && (
                <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-1">
                  {results.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-500">
                      Nothing in the catalog matches — add it under the Catalog tab first.
                    </p>
                  ) : (
                    results.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addItem(c)}
                        disabled={busy}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left active:bg-slate-800 disabled:opacity-50"
                      >
                        <Plus size={13} className="shrink-0 text-sky-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-200">
                            {itemLabel(c)}
                          </span>
                          {c.item_number && (
                            <span className="font-mono text-[10px] text-slate-500">
                              {c.item_number}
                            </span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              What's in it ({products})
            </p>

            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Empty. Search above to add what's actually in this tray.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {[...lines]
                  .sort((a, b) =>
                    (a.catalog_item?.name ?? "").localeCompare(b.catalog_item?.name ?? ""),
                  )
                  .map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">
                          {l.catalog_item ? itemLabel(l.catalog_item) : "Unknown product"}
                        </span>
                        {l.catalog_item?.item_number && (
                          <span className="font-mono text-[10px] text-slate-500">
                            {l.catalog_item.item_number}
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setQty(l.id, l.quantity_per_tote - 1)}
                          disabled={busy}
                          aria-label="One fewer"
                          className="min-h-0 rounded bg-slate-700 p-1.5 text-slate-300 active:bg-slate-600 disabled:opacity-50"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums text-white">
                          {l.quantity_per_tote}
                        </span>
                        <button
                          onClick={() => setQty(l.id, l.quantity_per_tote + 1)}
                          disabled={busy}
                          aria-label="One more"
                          className="min-h-0 rounded bg-slate-700 p-1.5 text-slate-300 active:bg-slate-600 disabled:opacity-50"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => setQty(l.id, 0)}
                          disabled={busy}
                          aria-label="Remove from set"
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
                    Delete "{name}" and all {products} of its lines? This can't be undone.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-slate-300"
                    >
                      Keep it
                    </button>
                    <button
                      onClick={removeSet}
                      disabled={busy}
                      className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Delete set
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-sm text-red-400/80"
                >
                  Delete this set
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
