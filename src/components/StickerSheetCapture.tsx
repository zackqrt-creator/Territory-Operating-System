import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp } from "lucide-react";
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
  buildReorderNotes,
  matchSheet,
  parseStickerSheet,
  type SheetSticker,
  type StickerMatch,
} from "../lib/stickerSheet";
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
 * Post-case sticker sheet capture: photograph the paper the implant stickers
 * went on, OCR every sticker on it, match each against territory inventory,
 * and — after the rep reviews and confirms — deduct the used units and drop a
 * reorder task on their board. OCR never deducts anything by itself.
 */
export default function StickerSheetCapture({
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
  const [stickers, setStickers] = useState<SheetSticker[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [pages, setPages] = useState(0);
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

  const matches: StickerMatch[] = matchSheet(stickers, inventory, caseRow.facility_id);

  /**
   * Reads one or more sheet photos.
   *
   * Accepts a whole selection at once because a case's stickers routinely run
   * to two or three pages, and because a sheet the rep did not photograph
   * themselves arrives as a batch from whoever did.
   *
   * Uses `ocrPage` rather than `ocrLabel`: a photo taken by someone else, of a
   * sheet lying on a counter, is very often sideways, and tesseract does not
   * recover from that on its own -- it returns confident nonsense. Each
   * quarter-turn is scored by how many REF codes it yields and the best wins.
   */
  async function onPhotos(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setReading(true);
    setError(null);

    let added = 0;
    let readCount = 0;
    try {
      for (let n = 0; n < list.length; n++) {
        const label = list.length > 1 ? ` (page ${n + 1} of ${list.length})` : "";
        setProgress(`Reading…${label}`);
        const { text } = await ocrPage(
          list[n],
          (t) => parseStickerSheet(t, catalog).length,
          (message) => setProgress(message + label),
          // Stickers are small print, so this page needs more resolution than
          // a packing slip. Two readable REF codes already prove the sheet is
          // the right way up -- upside-down text does not yield valid ones --
          // and four passes over a 3200px page is a long time to stand there.
          { maxEdge: DENSE_PAGE_EDGE, goodEnough: 2 },
        );
        const found = parseStickerSheet(text, catalog);
        if (found.length === 0) continue;
        readCount++;
        added += found.length;

        setStickers((prev) => {
          const merged = [...prev];
          for (const s of found) {
            const dup = merged.find(
              (x) => x.scan.refText === s.scan.refText && x.scan.lot === s.scan.lot,
            );
            if (dup) dup.quantity += s.quantity;
            else merged.push(s);
          }
          // Newly matched lines start checked; unmatched can't be.
          const m = matchSheet(merged, inventory, caseRow.facility_id);
          setChecked(
            new Set(m.map((x, i) => (x.allocations.length > 0 ? i : -1)).filter((i) => i >= 0)),
          );
          return merged;
        });
      }

      setPages((p) => p + readCount);
      if (added === 0) {
        setError(
          list.length > 1
            ? "No REF codes found on any of those. They need to be sharp enough to read the printing — a screenshot of a text thread usually is not."
            : "No REF codes found on that photo. Try closer, flatter, better light.",
        );
      }
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

  const confirmed = matches.filter((_, i) => checked.has(i));
  const flagged = matches.filter((m, i) => !checked.has(i) || m.shortfall > 0 || m.quality === "none");
  const unitCount = confirmed.reduce(
    (sum, m) => sum + m.allocations.reduce((s, a) => s + a.quantity, 0),
    0,
  );

  async function onConfirm() {
    if (!profile || unitCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      await consumeStickerUsage({
        allocations: confirmed.flatMap((m) => m.allocations),
        caseId: caseRow.id,
        movedBy: profile.id,
        territoryId: profile.territory_id,
      });
      const unmatchedOnly = matches.filter((m) => m.quality === "none");
      await createTask({
        title: `Reorder: ${unitCount} implant${unitCount === 1 ? "" : "s"} used ${formatDateShort(caseRow.surgery_date)}`,
        notes: buildReorderNotes(confirmed, unmatchedOnly, facilities),
        due_date: tomorrow(),
        assigned_to: assignTo,
        territory_id: profile.territory_id,
        owner_id: profile.id,
      });
      if (markComplete && caseRow.status !== "completed") {
        await completeCase(caseRow.id);
      }
      setResult({ deducted: unitCount, flagged: flagged.length });
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
            <h2 className="text-lg font-semibold text-white">Sticker sheet logged ✓</h2>
            <p className="mt-2 text-sm text-slate-300">
              {result.deducted} unit{result.deducted === 1 ? "" : "s"} deducted from inventory with
              an audit trail on this case, and a reorder task is on{" "}
              {assigneeName ? `${assigneeName}'s` : "your"} board due tomorrow.
            </p>
            {result.flagged > 0 && (
              <p className="mt-2 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
                {result.flagged} line{result.flagged === 1 ? "" : "s"} needed judgment (unmatched or
                short) — the details are in the reorder task.
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
            <h2 className="text-lg font-semibold text-white">📸 Sticker sheet</h2>
            <p className="mt-1 text-sm text-slate-400">
              Photograph the case paper with the implant stickers on it. Every sticker gets read,
              matched to your stock, and — after you confirm — deducted, with a reorder task
              created for you. Nothing is deducted without your OK.
            </p>

            {/*
              Two inputs, because `capture` is not a hint -- on a phone it
              removes the photo library as an option entirely. A rep who was
              not in the room has nothing to photograph and needs the picture
              someone else sent them.
            */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                onPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onPhotos(e.target.files);
                e.target.value = "";
              }}
            />

            {reading ? (
              <p className="mt-3 w-full rounded-lg border border-sky-800 bg-sky-950/40 py-3 text-center font-medium text-sky-300">
                {progress ?? "Reading stickers…"}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="rounded-lg border border-sky-700 bg-sky-950/40 py-3 font-medium text-sky-300"
                >
                  <Camera size={15} className="mr-1.5 inline" />
                  {pages === 0 ? "Take photo" : "Another page"}
                </button>
                <button
                  onClick={() => uploadRef.current?.click()}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 py-3 font-medium text-slate-300"
                >
                  <ImageUp size={15} className="mr-1.5 inline" />
                  Upload photo
                </button>
              </div>
            )}
            <p className="mt-1.5 text-center text-[11px] text-slate-600">
              Upload takes several pages at once, and reads a sideways photo — for sheets someone
              else shot and sent you.
            </p>

            {error && (
              <p className="mt-2 rounded-lg border border-red-800 bg-red-950/30 p-2.5 text-sm text-red-300">
                {error}
              </p>
            )}

            {matches.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Found {matches.length} sticker{matches.length === 1 ? "" : "s"} — uncheck anything
                  wrong
                </p>
                <div className="mt-2 space-y-2">
                  {matches.map((m, i) => {
                    const badge = QUALITY_BADGE[m.quality];
                    const name = m.allocations[0]?.item.name ?? m.sticker.scan.match?.name ?? m.sticker.scan.refText;
                    const on = checked.has(i);
                    return (
                      <button
                        key={`${m.sticker.scan.refText}-${m.sticker.scan.lot}-${i}`}
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
                          <span className="text-sm font-medium text-white">
                            {m.quality !== "none" && (on ? "☑ " : "☐ ")}
                            {m.sticker.quantity > 1 ? `${m.sticker.quantity}× ` : ""}
                            {name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          REF {m.sticker.scan.refText}
                          {m.sticker.scan.lot ? ` · lot ${m.sticker.scan.lot}` : " · no lot read"}
                        </p>
                        {m.allocations.map((a, j) => (
                          <p key={j} className="text-xs text-slate-400">
                            − {a.quantity} from {locName(a.item.location_id)}
                            {a.item.lot_number && a.item.lot_number !== m.sticker.scan.lot
                              ? ` (stock lot ${a.item.lot_number} — verify)`
                              : ""}
                          </p>
                        ))}
                        {m.shortfall > 0 && m.quality !== "none" && (
                          <p className="text-xs font-medium text-amber-400">
                            {m.shortfall} more used than in stock — will be flagged, not deducted
                          </p>
                        )}
                        {m.quality === "none" && (
                          <p className="text-xs font-medium text-red-400">
                            Not in inventory — will be flagged in the reorder task, not deducted
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
                    <p className="mb-1 text-xs text-slate-500">Reorder task for</p>
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
                    : `Deduct ${unitCount} unit${unitCount === 1 ? "" : "s"} + create reorder task`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
