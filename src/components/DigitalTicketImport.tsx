import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, ImageUp } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  completeCase,
  consumeStickerUsage,
  createTask,
  listCatalogItems,
  listProfiles,
} from "../lib/api";
import type { CaseRow, CatalogItem, Facility, InventoryItem, Profile } from "../lib/types";
import {
  buildTicketReplenishNotes,
  parseDigitalTicket,
  ticketLinesToStickers,
  type TicketLine,
} from "../lib/digitalTicket";
import { matchSheet, type StickerMatch } from "../lib/stickerSheet";
import { DENSE_PAGE_EDGE, ocrPage } from "../lib/ocr";
import { formatDateShort, tomorrow } from "../utils/dates";

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  lot_here: { label: "✓ exact lot", cls: "bg-emerald-500/15 text-emerald-300" },
  lot_elsewhere: { label: "✓ lot, other site", cls: "bg-sky-500/15 text-sky-300" },
  product_here: { label: "≈ lot differs", cls: "bg-amber-500/15 text-amber-300" },
  product_elsewhere: { label: "≈ other site", cls: "bg-amber-500/15 text-amber-300" },
  none: { label: "not in inventory", cls: "bg-red-500/15 text-red-300" },
};

/**
 * Post-case Digital Ticket import: MyOps already knows exactly what was used
 * on this case — item number, lot, and its own Repl. (replenish) flag. This
 * reads that instead of re-deriving it from a photographed sticker sheet, so
 * matching is exact rather than a best-effort OCR read.
 *
 * Territory OS runs beside MyOps here, not instead of it: MyOps stays the
 * billing/audit system of record, this just saves re-typing what it already
 * said, so local stock and the reorder task pick it up automatically.
 *
 * Pasted text is the primary path — copied straight out of the ticket, zero
 * OCR risk. A photo/screenshot is the fallback for when only that exists,
 * reusing the same OCR pipeline the sticker-sheet capture uses.
 */
export default function DigitalTicketImport({
  caseRow,
  inventory,
  facilities,
  onClose,
  onDone,
}: {
  caseRow: CaseRow;
  inventory: InventoryItem[];
  facilities: Facility[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [markComplete, setMarkComplete] = useState(caseRow.status !== "completed");
  const [pasted, setPasted] = useState("");
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ deducted: number; flagged: number } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listCatalogItems().then(setCatalog).catch(() => {});
    listProfiles().then(setProfiles).catch(() => {});
  }, []);

  const teammates = profiles.filter((p) => p.id !== profile?.id);
  const assigneeName = assignTo
    ? (profiles.find((p) => p.id === assignTo)?.display_name ?? "teammate")
    : null;

  const matches: StickerMatch[] = matchSheet(
    ticketLinesToStickers(lines),
    inventory,
    caseRow.facility_id,
  );

  function applyText(text: string) {
    const scan = parseDigitalTicket(text, catalog);
    if (scan.lines.length === 0) {
      setError("No item numbers found in that text — paste the whole ticket, table and all.");
      return;
    }
    setLines(scan.lines);
    const m = matchSheet(ticketLinesToStickers(scan.lines), inventory, caseRow.facility_id);
    setChecked(new Set(m.map((x, i) => (x.allocations.length > 0 ? i : -1)).filter((i) => i >= 0)));
    setError(null);
  }

  function onPasteChange(text: string) {
    setPasted(text);
  }

  /** Photo/screenshot fallback, for when only an image of the ticket exists. */
  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      const { text } = await ocrPage(
        file,
        (t) => parseDigitalTicket(t, catalog).lines.length,
        setProgress,
        { maxEdge: DENSE_PAGE_EDGE, goodEnough: 3 },
      );
      applyText(text);
    } catch {
      setError("Couldn't read that photo — check your connection for the first scan, or try again.");
    } finally {
      setReading(false);
      setProgress(null);
    }
  }

  function toggle(i: number) {
    if (matches[i].allocations.length === 0) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const unitCount = [...checked].reduce(
    (sum, i) => sum + matches[i].allocations.reduce((s, a) => s + a.quantity, 0),
    0,
  );
  const replenishCount = lines.filter((l, i) => checked.has(i) && l.replenish).length;

  async function onConfirm() {
    if (!profile || unitCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const confirmedAllocations = [...checked].flatMap((i) => matches[i].allocations);
      await consumeStickerUsage({
        allocations: confirmedAllocations,
        caseId: caseRow.id,
        movedBy: profile.id,
        territoryId: profile.territory_id,
        source: "digital ticket",
      });
      const notes = buildTicketReplenishNotes(lines, matches, checked, facilities);
      await createTask({
        title: `Replenish: ${replenishCount || unitCount} item${(replenishCount || unitCount) === 1 ? "" : "s"} from case ${formatDateShort(caseRow.surgery_date)}`,
        notes,
        due_date: tomorrow(),
        assigned_to: assignTo,
        territory_id: profile.territory_id,
        owner_id: profile.id,
      });
      if (markComplete && caseRow.status !== "completed") {
        await completeCase(caseRow.id);
      }
      const flagged = matches.filter((m, i) => !checked.has(i) || m.shortfall > 0 || m.quality === "none").length;
      setResult({ deducted: unitCount, flagged });
      onDone();
    } catch {
      setError("Saving failed — nothing may have been deducted. Check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }

  const locName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        {result ? (
          <>
            <h2 className="text-lg font-semibold text-slate-100">Digital ticket logged ✓</h2>
            <p className="mt-2 text-sm text-slate-300">
              {result.deducted} unit{result.deducted === 1 ? "" : "s"} deducted from inventory, and a
              replenish task is on {assigneeName ? `${assigneeName}'s` : "your"} board due tomorrow.
            </p>
            {result.flagged > 0 && (
              <p className="mt-2 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
                {result.flagged} line{result.flagged === 1 ? "" : "s"} needed judgment (unmatched, short,
                or unchecked) — the details are in the replenish task.
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-sky-600 py-3 font-medium text-white"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-100">🎫 Digital ticket</h2>
            <p className="mt-1 text-sm text-slate-400">
              Paste the ticket MyOps emailed for this case, or attach a photo of it if that's all you
              have. Every line gets matched to your stock, and — after you confirm — deducted, with a
              replenish task created from MyOps' own Repl. flags. Nothing is deducted without your OK.
            </p>

            {lines.length === 0 && !reading && (
              <>
                <textarea
                  value={pasted}
                  onChange={(e) => onPasteChange(e.target.value)}
                  placeholder="Paste the ticket text here…"
                  rows={5}
                  className="mt-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyText(pasted)}
                    disabled={!pasted.trim()}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <ClipboardPaste size={15} /> Parse
                  </button>
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-700 bg-sky-950/40 py-3 text-sm font-medium text-sky-300"
                  >
                    <Camera size={15} /> Photo
                  </button>
                  <button
                    onClick={() => uploadRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 py-3 text-sm font-medium text-slate-300"
                  >
                    <ImageUp size={15} /> Upload
                  </button>
                </div>
              </>
            )}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPhoto(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPhoto(e.target.files);
                e.target.value = "";
              }}
            />

            {reading && (
              <p className="mt-3 w-full rounded-lg border border-sky-800 bg-sky-950/40 py-3 text-center font-medium text-sky-300">
                {progress ?? "Reading ticket…"}
              </p>
            )}

            {error && (
              <p className="mt-2 rounded-lg border border-red-800 bg-red-950/30 p-2.5 text-sm text-red-300">
                {error}
              </p>
            )}

            {lines.length > 0 && (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Found {lines.length} line{lines.length === 1 ? "" : "s"} — uncheck anything wrong
                  </p>
                  <button
                    onClick={() => {
                      setLines([]);
                      setPasted("");
                    }}
                    className="text-xs text-slate-500 underline"
                  >
                    Start over
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {lines.map((line, i) => {
                    const m = matches[i];
                    const badge = QUALITY_BADGE[m.quality];
                    const name = m.allocations[0]?.item.name ?? line.match?.name ?? line.description ?? line.itemNumber;
                    const on = checked.has(i);
                    return (
                      <button
                        key={`${line.itemNumber}-${line.lot}-${i}`}
                        onClick={() => toggle(i)}
                        className={`w-full rounded-lg border p-3 text-left ${
                          m.quality === "none"
                            ? "border-red-900 bg-red-950/20 opacity-90"
                            : on
                              ? "border-sky-700 bg-slate-800/70"
                              : "border-slate-700 bg-slate-900/50 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-100">
                            {m.quality !== "none" && (on ? "☑ " : "☐ ")}
                            {line.quantity > 1 ? `${line.quantity}× ` : ""}
                            {name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          REF {line.itemNumber}
                          {line.lot ? ` · lot ${line.lot}` : " · no lot read"}
                          {line.replenish && " · replenish"}
                        </p>
                        {m.allocations.map((a, j) => (
                          <p key={j} className="text-xs text-slate-400">
                            − {a.quantity} from {locName(a.item.location_id)}
                          </p>
                        ))}
                        {m.shortfall > 0 && m.quality !== "none" && (
                          <p className="text-xs font-medium text-amber-400">
                            {m.shortfall} more used than in stock — will be flagged, not deducted
                          </p>
                        )}
                        {m.quality === "none" && (
                          <p className="text-xs font-medium text-red-400">
                            Not in inventory — will be flagged in the replenish task, not deducted
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {caseRow.status !== "completed" && (
                  <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={markComplete}
                      onChange={(e) => setMarkComplete(e.target.checked)}
                    />
                    Mark this case completed
                  </label>
                )}
                {teammates.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-xs text-slate-500">Replenish task for</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setAssignTo(null)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          assignTo === null ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        Me
                      </button>
                      {teammates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setAssignTo((prev) => (prev === t.id ? null : t.id))}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            assignTo === t.id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {t.display_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={onConfirm}
                  disabled={saving || unitCount === 0}
                  className="mt-4 w-full rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-700 py-3 font-semibold text-white shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : `Deduct ${unitCount} unit${unitCount === 1 ? "" : "s"} + create replenish task`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
