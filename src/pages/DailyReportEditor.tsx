import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileText, ImagePlus, Plus, Sparkles, Upload, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  addDailyReportItem,
  addDailyReportPhoto,
  deleteDailyReportItem,
  deleteDailyReportPhoto,
  getDailyReportFull,
  getDailyReportSuggestions,
  listFacilities,
  updateDailyReport,
  updateDailyReportItem,
  updateDailyReportPhoto,
  uploadItemPhoto,
} from "../lib/api";
import { formatReportDate, isReportEmpty, sectionTitle, statusLabel } from "../lib/dailyReport";
import DailyReportItemSheet, { type ItemDraft } from "../components/DailyReportItemSheet";
import DailyReportGenerateSheet from "../components/DailyReportGenerateSheet";
import type {
  DailyReportFull,
  DailyReportItem,
  DailyReportSection,
  DailyReportSendMethod,
  Facility,
} from "../lib/types";

const SECTIONS: DailyReportSection[] = [
  "completed",
  "equipment",
  "outstanding",
  "manager_request",
  "tomorrow",
  "guidance",
];

/** One line of guidance per section, so the rep knows what belongs where. */
const SECTION_HINTS: Record<DailyReportSection, string> = {
  completed: "Cases, visits, deliveries, tote work, inventory, admin.",
  equipment: "Totes, trays, implants, replenishment, missing items.",
  outstanding: "Not finished — why, what is next, and when.",
  manager_request: "What was asked for today, and what happened.",
  tomorrow: "Cases, deliveries, visits, follow-ups, priorities.",
  guidance: "Anything you want confirmed before you act.",
};

export default function DailyReportEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [report, setReport] = useState<DailyReportFull | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [editing, setEditing] = useState<{
    section: DailyReportSection;
    item: DailyReportItem | null;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const full = await getDailyReportFull(id);
    setReport(full);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    Promise.all([getDailyReportFull(id), listFacilities()])
      .then(([full, facs]) => {
        setReport(full);
        setFacilities(facs);
        if (!full) setError("That report no longer exists.");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Couldn't load that report."),
      )
      .finally(() => setLoading(false));
  }, [id]);

  /*
   * Autosave the free-text header.
   *
   * Debounced rather than saved per keystroke: a rep types a summary in a
   * corridor on a bad connection, and a request per character is how you lose
   * the sentence you just wrote. The timer is cleared on unmount so navigating
   * away mid-sentence still lands the last edit.
   */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback(
    (patch: Partial<Pick<DailyReportFull, "area" | "summary" | "important_notes">>) => {
      if (!id) return;
      setReport((prev) => (prev ? { ...prev, ...patch } : prev));
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDailyReport(id, patch)
          .then(() => {
            setSaveState("saved");
            setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
          })
          .catch(() => setError("Couldn't save that. Your text is still on screen."));
      }, 700);
    },
    [id],
  );
  useEffect(() => () => void (saveTimer.current && clearTimeout(saveTimer.current)), []);

  const bySection = useMemo(() => {
    const map = new Map<DailyReportSection, DailyReportItem[]>();
    for (const s of SECTIONS) map.set(s, []);
    for (const item of report?.items ?? []) {
      map.get(item.section)?.push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [report]);

  async function saveItem(draft: ItemDraft) {
    if (!report || !profile) return;
    if (editing?.item) {
      await updateDailyReportItem(editing.item.id, draft);
    } else if (editing) {
      const siblings = bySection.get(editing.section) ?? [];
      await addDailyReportItem({
        territory_id: report.territory_id,
        report_id: report.id,
        section: editing.section,
        position: siblings.length,
        title: draft.title,
        detail: draft.detail ?? null,
        status: draft.status ?? null,
        category: draft.category ?? null,
        next_action: draft.next_action ?? null,
        expected_date: draft.expected_date ?? null,
        priority: draft.priority ?? null,
        location_id: draft.location_id ?? null,
        quantity: draft.quantity ?? null,
        occurred_at: draft.occurred_at ?? null,
        planned_time: draft.planned_time ?? null,
        source_type: draft.source_type ?? null,
        source_id: draft.source_id ?? null,
      });
    }
    await reload();
  }

  /**
   * Add a photo straight from the camera or the file picker.
   *
   * Selecting one already attached to a task covers the "enter it once" case,
   * but only if the work happened to be logged as a task with a photo on it.
   * Plenty of proof -- a tote on a shelf, a delivered case cart -- is just a
   * picture taken on the spot, and without this there was no way to attach it.
   */
  async function uploadPhotos(files: FileList) {
    if (!report || !profile) return;
    setUploading(true);
    setError(null);
    try {
      let position = report.photos.length;
      for (const file of Array.from(files)) {
        const url = await uploadItemPhoto(file, report.territory_id);
        await addDailyReportPhoto({
          territory_id: report.territory_id,
          report_id: report.id,
          url,
          caption: null,
          source_type: "upload",
          source_id: null,
          position: position++,
        });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  async function markSent(params: {
    sentTo: string;
    method: DailyReportSendMethod;
    snapshot: { generated_at: string; full: string; text_message: string };
  }) {
    if (!report) return;
    await updateDailyReport(report.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_to: params.sentTo || null,
      sent_method: params.method,
      sent_snapshot: params.snapshot,
    });
    await reload();
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 pt-6 text-slate-400" aria-live="polite">
        Loading report…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen px-4 pt-6">
        <p className="text-slate-400">{error ?? "Report not found."}</p>
        <button onClick={() => navigate("/daily")} className="mt-4 text-sky-400 underline">
          <span className="text-sm">Back to daily reports</span>
        </button>
      </div>
    );
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-600";
  const label = "text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500";
  const sent = report.status === "sent" || report.status === "acknowledged";

  return (
    <div className="min-h-screen px-4 pb-28 pt-4">
      <button
        onClick={() => navigate("/daily")}
        className="flex items-center gap-1 text-slate-400"
      >
        <ChevronLeft size={16} aria-hidden />
        <span className="text-sm">Daily reports</span>
      </button>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-slate-100">
            {formatReportDate(report.report_date)}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {sent
              ? `Sent${report.sent_to ? ` to ${report.sent_to}` : ""} — the copy that went out is preserved`
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Draft — nothing leaves the app until you send it"}
          </p>
        </div>
        <button
          onClick={() => setShowSuggestions((s) => !s)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-slate-300"
        >
          <Sparkles size={15} aria-hidden />
          <span className="text-sm">From today</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 border-l border-red-400 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {showSuggestions && (
        <SuggestionPanel
          date={report.report_date}
          onClose={() => setShowSuggestions(false)}
          onPick={async (draft, section) => {
            const siblings = bySection.get(section) ?? [];
            await addDailyReportItem({
              territory_id: report.territory_id,
              report_id: report.id,
              section,
              position: siblings.length,
              title: draft.title,
              detail: draft.detail ?? null,
              status: draft.status ?? null,
              category: draft.category ?? null,
              next_action: null,
              expected_date: null,
              priority: null,
              location_id: null,
              quantity: null,
              occurred_at: null,
              planned_time: null,
              source_type: draft.source_type ?? null,
              source_id: draft.source_id ?? null,
            });
            await reload();
          }}
          onPickPhoto={async (url, caption, sourceId) => {
            await addDailyReportPhoto({
              territory_id: report.territory_id,
              report_id: report.id,
              url,
              caption,
              source_type: "task_photo",
              source_id: sourceId,
              position: report.photos.length,
            });
            await reload();
          }}
        />
      )}

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className={label}>Territory / area</span>
          <input
            value={report.area ?? ""}
            onChange={(e) => queueSave({ area: e.target.value })}
            className={field}
            placeholder="Stockton / Lodi"
          />
        </label>
        <label className="block">
          <span className={label}>Daily summary</span>
          <textarea
            value={report.summary ?? ""}
            onChange={(e) => queueSave({ summary: e.target.value })}
            rows={3}
            className={field}
            placeholder="A couple of sentences on how the day went."
          />
        </label>
        <label className="block">
          <span className={label}>Important notes</span>
          <textarea
            value={report.important_notes ?? ""}
            onChange={(e) => queueSave({ important_notes: e.target.value })}
            rows={2}
            className={field}
          />
        </label>
      </div>

      {SECTIONS.map((section) => {
        const items = bySection.get(section) ?? [];
        return (
          <section key={section} className="mt-7">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
                {sectionTitle(section)}
              </h2>
              <button
                onClick={() => setEditing({ section, item: null })}
                className="flex min-h-0 items-center gap-1 py-1 text-sky-400"
              >
                <Plus size={14} aria-hidden />
                <span className="text-sm">Add</span>
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{SECTION_HINTS[section]}</p>

            {items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setEditing({ section, item })}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left active:bg-slate-800"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-100">{item.title}</span>
                        {item.detail && (
                          <span className="mt-0.5 block text-sm text-slate-400">{item.detail}</span>
                        )}
                        {(item.next_action || item.expected_date) && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {item.next_action ? `Next: ${item.next_action}` : ""}
                            {item.next_action && item.expected_date ? " · " : ""}
                            {item.expected_date ? `By ${item.expected_date}` : ""}
                          </span>
                        )}
                      </span>
                      {statusLabel(item.status) && (
                        <span className="shrink-0 rounded-full bg-slate-500/20 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {statusLabel(item.status)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
            Photos / documentation
          </h2>
          <span className="flex items-center gap-4">
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              className="flex min-h-0 items-center gap-1 py-1 text-sky-400 disabled:opacity-50"
            >
              <Upload size={14} aria-hidden />
              <span className="text-sm">{uploading ? "Uploading…" : "Upload"}</span>
            </button>
            <button
              onClick={() => setShowSuggestions(true)}
              className="flex min-h-0 items-center gap-1 py-1 text-sky-400"
            >
              <ImagePlus size={14} aria-hidden />
              <span className="text-sm">From tasks</span>
            </button>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Take or pick a photo, or reuse one already on today's tasks. Only what you add here is
          included; everything else stays private.
        </p>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = "";
            if (files?.length) void uploadPhotos(files);
          }}
        />

        {report.photos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No photos selected.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {report.photos.map((p) => (
              <li key={p.id} className="relative overflow-hidden rounded-xl border border-slate-700">
                <img src={p.url} alt={p.caption ?? "Selected report photo"} className="h-28 w-full object-cover" />
                <input
                  value={p.caption ?? ""}
                  onChange={(e) => {
                    const caption = e.target.value;
                    setReport((prev) =>
                      prev
                        ? {
                            ...prev,
                            photos: prev.photos.map((x) => (x.id === p.id ? { ...x, caption } : x)),
                          }
                        : prev,
                    );
                  }}
                  onBlur={(e) => void saveCaption(p.id, e.target.value)}
                  className="w-full border-t border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
                  placeholder="What it shows"
                />
                <button
                  onClick={async () => {
                    await deleteDailyReportPhoto(p.id);
                    await reload();
                  }}
                  aria-label="Remove photo from report"
                  className="absolute right-1 top-1 min-h-0 rounded-full bg-black/60 p-1.5 text-white"
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={() => setGenerating(true)}
        disabled={isReportEmpty(report)}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <FileText size={17} aria-hidden />
        Generate report
      </button>
      {isReportEmpty(report) && (
        <p className="mt-1.5 text-xs text-slate-500">
          Add a summary or at least one line before generating.
        </p>
      )}

      {report.sent_snapshot && (
        <details className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <summary className="text-sm font-medium text-slate-300">
            What was sent {report.sent_at ? `on ${new Date(report.sent_at).toLocaleString()}` : ""}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-400">
            {report.sent_snapshot.full}
          </pre>
        </details>
      )}

      {editing && (
        <DailyReportItemSheet
          section={editing.section}
          existing={editing.item}
          facilities={facilities}
          onClose={() => setEditing(null)}
          onSave={saveItem}
          onDelete={
            editing.item
              ? async () => {
                  await deleteDailyReportItem(editing.item!.id);
                  await reload();
                }
              : undefined
          }
        />
      )}

      {generating && (
        <DailyReportGenerateSheet
          report={report}
          facilities={facilities}
          authorName={profile?.display_name ?? null}
          onClose={() => setGenerating(false)}
          onMarkSent={markSent}
        />
      )}
    </div>
  );
}

/** Captions save on blur rather than per keystroke; they are short and final. */
async function saveCaption(photoId: string, caption: string) {
  await updateDailyReportPhoto(photoId, { caption: caption.trim() || null });
}

/**
 * What the app already knows about this day, offered as one-tap additions.
 *
 * "Enter it once" is the principle, but the privacy rule outranks it: this
 * panel only ever proposes. Nothing here reaches the report, and nothing
 * reaches a manager, until the rep taps it.
 */
function SuggestionPanel({
  date,
  onClose,
  onPick,
  onPickPhoto,
}: {
  date: string;
  onClose: () => void;
  onPick: (draft: ItemDraft & { source_type?: "task" | "case" }, section: DailyReportSection) => Promise<void>;
  onPickPhoto: (url: string, caption: string | null, sourceId: string) => Promise<void>;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDailyReportSuggestions>> | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getDailyReportSuggestions(date)
      .then(setData)
      .catch(() => setFailed(true));
  }, [date]);

  const row = (key: string, text: string, run: () => Promise<void>) => (
    <button
      key={key}
      disabled={busy === key}
      onClick={async () => {
        setBusy(key);
        try {
          await run();
        } finally {
          setBusy(null);
        }
      }}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-slate-200 disabled:opacity-50"
    >
      <Plus size={14} className="shrink-0 text-sky-400" aria-hidden />
      <span className="min-w-0 truncate text-sm">{text}</span>
    </button>
  );

  return (
    <div className="mt-4 rounded-xl border border-sky-800 bg-sky-950 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">From today</h2>
        <button onClick={onClose} aria-label="Close suggestions" className="min-h-0 p-1 text-slate-400">
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Tap to add. Nothing here is in the report until you do.
      </p>

      {failed ? (
        <p className="mt-3 text-sm text-slate-400">Couldn't load today's activity.</p>
      ) : !data ? (
        <p className="mt-3 text-sm text-slate-400" aria-live="polite">
          Looking…
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {data.tasksDone.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                Finished today
              </p>
              {data.tasksDone.map((t) =>
                row(`done-${t.id}`, t.title, () =>
                  onPick(
                    { title: t.title, detail: t.notes, status: "complete", source_type: "task", source_id: t.id },
                    "completed",
                  ),
                ),
              )}
            </div>
          )}

          {data.cases.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                Cases today
              </p>
              {data.cases.map((c) =>
                row(
                  `case-${c.id}`,
                  `${c.surgery_type}${c.side ? ` ${c.side}` : ""}${c.surgeon ? ` — ${c.surgeon}` : ""}`,
                  () =>
                    onPick(
                      {
                        title: `${c.surgery_type}${c.side ? ` ${c.side}` : ""} case${c.surgeon ? ` — ${c.surgeon}` : ""}`,
                        category: "Case support",
                        status: "complete",
                        source_type: "case",
                        source_id: c.id,
                      },
                      "completed",
                    ),
                ),
              )}
            </div>
          )}

          {data.tasksOpen.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                Still open
              </p>
              {data.tasksOpen.slice(0, 8).map((t) =>
                row(`open-${t.id}`, t.title, () =>
                  onPick(
                    {
                      title: t.title,
                      detail: t.notes,
                      status: t.status === "doing" ? "in_progress" : "pending",
                      source_type: "task",
                      source_id: t.id,
                    },
                    "outstanding",
                  ),
                ),
              )}
            </div>
          )}

          {data.photos.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                Photos from today's work
              </p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {data.photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void onPickPhoto(p.url, p.caption, p.id)}
                    className="min-h-0 overflow-hidden rounded-lg border border-slate-700"
                    aria-label={`Add photo${p.caption ? `: ${p.caption}` : ""} to the report`}
                  >
                    <img src={p.url} alt="" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.tasksDone.length === 0 &&
            data.cases.length === 0 &&
            data.tasksOpen.length === 0 &&
            data.photos.length === 0 && (
              <p className="text-sm text-slate-400">
                Nothing recorded for this day yet — add lines by hand below.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
