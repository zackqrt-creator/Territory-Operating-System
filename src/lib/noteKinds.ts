import {
  Zap,
  ClipboardList,
  Stethoscope,
  Building2,
  PackageX,
  RefreshCw,
  Truck,
  BookOpen,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { TerritoryNoteType } from "./types";

/**
 * How a note can be filed -- **after** it is written, never before.
 *
 * These were once the eight buttons on the capture sheet, which meant picking
 * a category was the price of writing anything down. Capture now always
 * creates 'general', shown as Inbox; NoteDetail offers this list for filing,
 * and the Notes sidebar lists only the kinds that hold something.
 *
 * The underlying territory_notes.note_type stores `value`. Anything not in
 * this list (legacy loaner/meeting/idea/etc.) falls back to the generic icon.
 */
export interface NoteKind {
  value: TerritoryNoteType;
  label: string;
  Icon: LucideIcon;
}

export const NOTE_KINDS: NoteKind[] = [
  { value: "general", label: "Quick capture", Icon: Zap },
  { value: "case", label: "Case debrief", Icon: ClipboardList },
  { value: "surgeon", label: "Surgeon preference", Icon: Stethoscope },
  { value: "hospital", label: "Hospital rule", Icon: Building2 },
  { value: "inventory", label: "Inventory issue", Icon: PackageX },
  { value: "replenishment", label: "Replenishment note", Icon: RefreshCw },
  { value: "logistics", label: "Logistics note", Icon: Truck },
  { value: "playbook", label: "Playbook entry", Icon: BookOpen },
];

const BY_VALUE = new Map(NOTE_KINDS.map((k) => [k.value, k]));

export function noteKindLabel(t: TerritoryNoteType): string {
  return BY_VALUE.get(t)?.label ?? "Note";
}

export function noteKindIcon(t: TerritoryNoteType): LucideIcon {
  return BY_VALUE.get(t)?.Icon ?? StickyNote;
}
