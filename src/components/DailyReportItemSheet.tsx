import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DAILY_REPORT_CATEGORIES } from "../lib/types";
import { sectionTitle } from "../lib/dailyReport";
import type {
  DailyReportItem,
  DailyReportItemStatus,
  DailyReportPriority,
  DailyReportSection,
  Facility,
} from "../lib/types";

/**
 * One editor for all six sections.
 *
 * The sections differ by which fields matter, not by shape, so this shows a
 * different subset rather than being six near-identical forms. A rep filling in
 * "Completed" should not be scrolling past an expected-completion date that
 * only makes sense for outstanding work.
 */

const STATUS_OPTIONS: { value: DailyReportItemStatus; label: string }[] = [
  { value: "complete", label: "Complete" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending", label: "Pending" },
  { value: "needs_attention", label: "Needs Attention" },
];

const PRIORITY_OPTIONS: { value: DailyReportPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

/** Which fields each section actually uses. */
function fieldsFor(section: DailyReportSection) {
  return {
    category: section === "completed" || section === "tomorrow",
    status: section !== "guidance" && section !== "tomorrow",
    location: true,
    quantity: section === "manager_request" || section === "equipment",
    time: section === "manager_request",
    plannedTime: section === "tomorrow",
    priority: section === "tomorrow",
    nextAction: section === "outstanding" || section === "guidance",
    expectedDate: section === "outstanding" || section === "tomorrow",
  };
}

/** Section-specific wording, so the form asks for the thing it actually wants. */
function labelsFor(section: DailyReportSection) {
  switch (section) {
    case "manager_request":
      return { title: "Request / instruction", detail: "What you understood, and what you did" };
    case "outstanding":
      return { title: "What is outstanding", detail: "Why it is outstanding" };
    case "guidance":
      return { title: "What you need confirmed", detail: "Your current plan" };
    case "equipment":
      return { title: "Item", detail: "Notes" };
    case "tomorrow":
      return { title: "Planned work", detail: "Notes" };
    default:
      return { title: "What you did", detail: "Notes" };
  }
}

export type ItemDraft = Partial<Omit<DailyReportItem, "id" | "territory_id" | "report_id" | "created_at">> & {
  title: string;
};

export default function DailyReportItemSheet({
  section,
  existing,
  facilities,
  onClose,
  onSave,
  onDelete,
}: {
  section: DailyReportSection;
  existing: DailyReportItem | null;
  facilities: Facility[];
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const fields = fieldsFor(section);
  const labels = labelsFor(section);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [detail, setDetail] = useState(existing?.detail ?? "");
  const [status, setStatus] = useState<DailyReportItemStatus | "">(existing?.status ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [nextAction, setNextAction] = useState(existing?.next_action ?? "");
  const [expectedDate, setExpectedDate] = useState(existing?.expected_date ?? "");
  const [priority, setPriority] = useState<DailyReportPriority | "">(existing?.priority ?? "");
  const [locationId, setLocationId] = useState(existing?.location_id ?? "");
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : "");
  const [plannedTime, setPlannedTime] = useState(existing?.planned_time ?? "");
  const [time, setTime] = useState(
    existing?.occurred_at ? new Date(existing.occurred_at).toISOString().slice(11, 16) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      // A time on its own is meaningless; anchor it to the report's own day.
      const occurredAt = time
        ? new Date(`${new Date().toISOString().slice(0, 10)}T${time}:00`).toISOString()
        : null;
      await onSave({
        title: title.trim(),
        detail: detail.trim() || null,
        status: fields.status && status ? status : null,
        category: fields.category && category ? category : null,
        next_action: fields.nextAction && nextAction.trim() ? nextAction.trim() : null,
        expected_date: fields.expectedDate && expectedDate ? expectedDate : null,
        priority: fields.priority && priority ? priority : null,
        location_id: locationId || null,
        quantity: fields.quantity && quantity ? Number(quantity) : null,
        occurred_at: fields.time ? occurredAt : null,
        planned_time: fields.plannedTime && plannedTime.trim() ? plannedTime.trim() : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-600";
  const label = "text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-100">
          {existing ? "Edit" : "Add"} — {sectionTitle(section)}
        </h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={label}>{labels.title}</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
              placeholder="Short and specific"
            />
          </label>

          <label className="block">
            <span className={label}>{labels.detail}</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              className={field}
            />
          </label>

          {fields.status && (
            <div>
              <span className={label}>Status</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setStatus(status === o.value ? "" : o.value)}
                    className={`rounded-lg py-2.5 font-medium ${
                      status === o.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <span className="text-sm">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fields.category && (
            <label className="block">
              <span className={label}>Kind of work</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
                <option value="">—</option>
                {DAILY_REPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className={label}>Location / account</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={field}
            >
              <option value="">—</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          {(fields.quantity || fields.time) && (
            <div className="grid grid-cols-2 gap-2">
              {fields.quantity && (
                <label className="block">
                  <span className={label}>Quantity</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className={field}
                  />
                </label>
              )}
              {fields.time && (
                <label className="block">
                  <span className={label}>Time received</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={field}
                  />
                </label>
              )}
            </div>
          )}

          {fields.plannedTime && (
            <label className="block">
              <span className={label}>Expected time</span>
              <input
                value={plannedTime}
                onChange={(e) => setPlannedTime(e.target.value)}
                className={field}
                placeholder="first case, before 10, afternoon…"
              />
            </label>
          )}

          {fields.priority && (
            <div>
              <span className={label}>Priority</span>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {PRIORITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setPriority(priority === o.value ? "" : o.value)}
                    className={`rounded-lg py-2.5 font-medium ${
                      priority === o.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <span className="text-sm">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fields.nextAction && (
            <label className="block">
              <span className={label}>
                {section === "guidance" ? "The question for your manager" : "Next action"}
              </span>
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                className={field}
                placeholder={
                  section === "guidance" ? "1 additional tote, or a different quantity?" : ""
                }
              />
            </label>
          )}

          {fields.expectedDate && (
            <label className="block">
              <span className={label}>Expected completion</span>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={field}
              />
            </label>
          )}
        </div>

        <button
          onClick={save}
          disabled={!title.trim() || saving}
          className="mt-5 w-full rounded-lg bg-sky-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {existing && onDelete && (
          <button
            onClick={async () => {
              await onDelete();
              onClose();
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-2.5 text-slate-400"
          >
            <Trash2 size={15} aria-hidden />
            <span className="text-sm">Remove from report</span>
          </button>
        )}

        <button onClick={onClose} className="mt-2 w-full text-slate-500 underline">
          <span className="text-sm">Cancel</span>
        </button>
      </div>
    </div>
  );
}
