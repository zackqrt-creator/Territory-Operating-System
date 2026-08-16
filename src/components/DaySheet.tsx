import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createCalendarBlock,
  deleteCalendarBlock,
  listCalendarBlocks,
  listCaseAssignees,
  updateCalendarBlock,
} from "../lib/api";
import NotesSection from "./NotesSection";
import type {
  CalendarBlock,
  CalendarBlockKind,
  CaseAssignee,
  CaseRow,
  Facility,
  Profile,
} from "../lib/types";
import { caseRepId, repInitials } from "../lib/runsheet";
import { formatDateShort, formatTime, isToday } from "../utils/dates";

/** The surgical day. Earlier than 6am and later than 6pm effectively never happens. */
const FIRST_HOUR = 6;
const LAST_HOUR = 18;

const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

function hourOf(time: string | null): number | null {
  if (!time) return null;
  const h = Number(time.split(":")[0]);
  return Number.isFinite(h) ? h : null;
}

function hourLabel(h: number): string {
  return formatTime(`${String(h).padStart(2, "0")}:00`);
}

const BLOCK_KINDS: { value: CalendarBlockKind; label: string }[] = [
  { value: "hospital_visit", label: "Hospital visit" },
  { value: "in_service", label: "In-service" },
  { value: "travel", label: "Travel" },
  { value: "admin", label: "Admin" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

/**
 * Tap a day, get the day. Cases sit in the hour they actually start, so the
 * shape of the day is visible at a glance -- back-to-backs, the gap you could
 * fit a case into, the 6am start that means leaving at 4.
 *
 * Tapping an empty hour starts a new case already carrying that date and time,
 * which is the whole point: scheduling should be two taps, not a form.
 */
export default function DaySheet({
  date,
  cases,
  facilities,
  profiles,
  currentProfileId,
  territoryId,
  onClose,
  onOpenCase,
}: {
  date: string;
  cases: CaseRow[];
  facilities: Facility[];
  profiles: Profile[];
  currentProfileId?: string;
  territoryId?: string;
  onClose: () => void;
  onOpenCase: (c: CaseRow) => void;
}) {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  // "Other" by default and hidden behind a toggle -- picking a category up
  // front turned a one-line note into a six-button form. Most events don't
  // need one; the rare one that does can still get tagged, before or after.
  const [draftKind, setDraftKind] = useState<CalendarBlockKind>("other");
  const [showDraftKind, setShowDraftKind] = useState(false);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKind, setEditKind] = useState<CalendarBlockKind>("hospital_visit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<CaseAssignee[]>([]);

  // Coverage shows on the chip so a shared case is obvious from the day view
  // rather than only after opening it. Fails quiet before migration 045.
  useEffect(() => {
    const ids = cases.map((c) => c.id);
    if (ids.length === 0) {
      setAssignees([]);
      return;
    }
    listCaseAssignees(ids).then(setAssignees).catch(() => setAssignees([]));
  }, [cases]);

  function loadBlocks() {
    listCalendarBlocks(date, date)
      .then(setBlocks)
      // The blocks table may not exist yet if migration 045 has not been run;
      // the day sheet is still useful without it, so fail quiet.
      .catch(() => setBlocks([]));
  }

  useEffect(loadBlocks, [date]);

  async function saveBlock(hour: number) {
    if (!draftLabel.trim() || !territoryId || !currentProfileId) return;
    setBusy(true);
    setError(null);
    try {
      await createCalendarBlock({
        territory_id: territoryId,
        rep_id: currentProfileId,
        block_date: date,
        start_time: `${String(hour).padStart(2, "0")}:00`,
        end_time: null,
        label: draftLabel.trim(),
        kind: draftKind,
        facility_id: null,
        notes: null,
        created_by: currentProfileId,
      });
      setDraftLabel("");
      setDrafting(null);
      setShowDraftKind(false);
      setDraftKind("other");
      loadBlocks();
    } catch {
      // Keep the draft on screen -- retyping it is the last thing anyone
      // wants after a save that looked like it worked.
      setError("Couldn't save that block. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(b: CalendarBlock) {
    setEditingBlock(b.id);
    setEditLabel(b.label);
    setEditKind(b.kind);
    setOpenBlock(b.id);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateCalendarBlock(id, { label: editLabel.trim(), kind: editKind });
      setEditingBlock(null);
      loadBlocks();
    } catch {
      setError("Couldn't save that change. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string) {
    setError(null);
    try {
      await deleteCalendarBlock(id);
    } catch {
      // A block that quietly refuses to delete leaves a phantom commitment on
      // the day, which is worse than an error message.
      setError("Couldn't delete that block. Check your signal and try again.");
    }
    loadBlocks();
  }

  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";

  // A case with no time yet still has to be visible, or it silently vanishes
  // from the one screen meant to show the whole day.
  const untimed = cases.filter((c) => c.time_tba || !c.surgery_time);
  const timed = cases.filter((c) => !c.time_tba && c.surgery_time);

  const byHour = new Map<number, CaseRow[]>();
  for (const c of timed) {
    const h = hourOf(c.surgery_time);
    if (h === null) continue;
    // Anything outside the normal day clamps to the edges rather than disappearing.
    const slot = Math.min(Math.max(h, FIRST_HOUR), LAST_HOUR);
    byHour.set(slot, [...(byHour.get(slot) ?? []), c]);
  }

  const blocksByHour = new Map<number, CalendarBlock[]>();
  for (const b of blocks) {
    const h = hourOf(b.start_time);
    if (h === null) continue;
    const slot = Math.min(Math.max(h, FIRST_HOUR), LAST_HOUR);
    blocksByHour.set(slot, [...(blocksByHour.get(slot) ?? []), b]);
  }

  function addAt(hour: number) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    navigate(`/cases/new?date=${date}&time=${time}`);
  }

  function CaseChip({ c }: { c: CaseRow }) {
    const mine = caseRepId(c) === currentProfileId;
    return (
      <button
        onClick={() => onOpenCase(c)}
        className={`w-full rounded-lg border p-2.5 text-left active:bg-slate-800 ${
          mine ? "border-sky-800 bg-sky-950/40" : "border-slate-700 bg-slate-800/50"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              mine ? "bg-sky-500/20 text-sky-300" : "bg-slate-700 text-slate-300"
            }`}
          >
            {repInitials(profiles.find((p) => p.id === caseRepId(c)))}
          </span>
          {assignees
            .filter((a) => a.case_id === c.id)
            .map((a) => (
              <span
                key={a.id}
                title={a.role}
                className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300"
              >
                {repInitials(profiles.find((p) => p.id === a.profile_id))}
              </span>
            ))}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
            {c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instrument"}
            {c.variant === "partial" ? " · Partial" : ""}
            {c.side ? ` · ${c.side === "LEFT" ? "L" : "R"}` : ""}
          </span>
          {c.surgery_time && !c.time_tba && (
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {formatTime(c.surgery_time)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {facilityName(c.facility_id)}
          {c.surgeon ? ` · ${c.surgeon}` : ""}
        </p>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {formatDateShort(date)}
            {isToday(date) && <span className="ml-2 text-xs font-normal text-sky-400">Today</span>}
          </h2>
          <p className="text-xs text-slate-400">
            {cases.length === 0
              ? "Nothing scheduled"
              : `${cases.length} case${cases.length === 1 ? "" : "s"}`}
            {untimed.length > 0 && ` · ${untimed.length} without a time`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg bg-slate-800 p-2 text-slate-300 active:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <p className="border-b border-red-900 bg-red-950 px-4 py-2 text-xs text-red-400">{error}</p>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {untimed.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <Clock size={13} /> Needs a time
            </p>
            <div className="space-y-2">
              {untimed.map((c) => (
                <CaseChip key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {HOURS.map((h) => {
            const slot = byHour.get(h) ?? [];
            const hourBlocks = blocksByHour.get(h) ?? [];
            return (
              <div key={h} className="flex gap-2">
                <span className="w-14 shrink-0 pt-2 text-right text-[11px] tabular-nums text-slate-500">
                  {hourLabel(h)}
                </span>
                <div className="min-w-0 flex-1 border-t border-slate-800/80 pb-1 pt-1">
                  {(slot.length > 0 || hourBlocks.length > 0) && (
                    <div className="space-y-1.5">
                      {slot.map((c) => (
                        <CaseChip key={c.id} c={c} />
                      ))}
                      {hourBlocks.map((b) =>
                        editingBlock === b.id ? (
                          <div
                            key={b.id}
                            className="rounded-lg border border-sky-800 bg-slate-900 p-2"
                          >
                            <input
                              autoFocus
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-2 text-sm text-slate-100"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {BLOCK_KINDS.map((k) => (
                                <button
                                  key={k.value}
                                  onClick={() => setEditKind(k.value)}
                                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                                    editKind === k.value
                                      ? "bg-sky-600 text-white"
                                      : "bg-slate-800 text-slate-400"
                                  }`}
                                >
                                  {k.label}
                                </button>
                              ))}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(b.id)}
                                disabled={busy || !editLabel.trim()}
                                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {busy ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingBlock(null)}
                                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={b.id}
                            className="rounded-lg border border-slate-700/70 bg-slate-900 px-2.5 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setOpenBlock(openBlock === b.id ? null : b.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block truncate text-sm text-slate-200">{b.label}</span>
                                <span className="text-[11px] text-slate-500">
                                  {BLOCK_KINDS.find((k) => k.value === b.kind)?.label ?? "Other"}
                                  {" · "}
                                  {formatTime(b.start_time)}
                                </span>
                              </button>
                              {b.rep_id === currentProfileId && (
                                <>
                                  <button
                                    onClick={() => startEdit(b)}
                                    aria-label="Edit block"
                                    className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-800"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => removeBlock(b.id)}
                                    aria-label="Remove block"
                                    className="shrink-0 rounded p-1 text-slate-500 active:bg-slate-800"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                            {/*
                              A blocked-out hour is where the day's loose ends
                              live -- what the visit was for, what came out of it,
                              what it created. Tapping it opens that.
                            */}
                            {openBlock === b.id && (
                              <NotesSection
                                entityType="calendar_block"
                                entityId={b.id}
                                title="Notes on this block"
                              />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {drafting === h ? (
                    <div className="mt-1 rounded-lg border border-slate-700 bg-slate-900 p-2">
                      <input
                        autoFocus
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBlock(h);
                          if (e.key === "Escape") {
                            setDrafting(null);
                            setDraftLabel("");
                          }
                        }}
                        placeholder={`What is ${hourLabel(h)} for?`}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                      {showDraftKind ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {BLOCK_KINDS.map((k) => (
                            <button
                              key={k.value}
                              onClick={() => setDraftKind(k.value)}
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                draftKind === k.value
                                  ? "bg-sky-600 text-white"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {k.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDraftKind(true)}
                          className="mt-1.5 text-[11px] text-slate-500 underline"
                        >
                          Tag a category (optional)
                        </button>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => saveBlock(h)}
                          disabled={busy || !draftLabel.trim()}
                          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busy ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setDrafting(null);
                            setDraftLabel("");
                            setShowDraftKind(false);
                            setDraftKind("other");
                          }}
                          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Always available, even when the hour already holds a case
                    // or a block -- a rep's day is layered (a case AND a call AND
                    // a note about it), not one thing per hour.
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => addAt(h)}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs text-slate-600 active:bg-slate-900"
                      >
                        <Plus size={13} />
                        Case
                      </button>
                      <button
                        onClick={() => {
                          setDrafting(h);
                          setDraftLabel("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs text-slate-600 active:bg-slate-900"
                      >
                        <CalendarPlus size={13} />
                        Event
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
