import { Hash, Inbox, Layers, Lock, Pin, type LucideIcon } from "lucide-react";
import type { TerritoryNoteFeedItem } from "./types";
import { NOTE_KINDS, noteKindIcon } from "./noteKinds";

/**
 * Which buckets the Notes sidebar offers, and what falls into each.
 *
 * The old filter row listed all eight note kinds unconditionally, so a rep
 * with forty quick captures and nothing else still scrolled past seven empty
 * buckets. Here a bucket appears only once something is in it, and carries its
 * count -- the shape of the sidebar is the shape of what you actually wrote.
 *
 * Kinds are an organizing dimension now, not a capture decision: notes arrive
 * in Inbox and stay there unless someone files them.
 */

export type NotesView =
  | { kind: "all" }
  | { kind: "inbox" }
  | { kind: "pinned" }
  | { kind: "private" }
  | { kind: "type"; value: string }
  | { kind: "tag"; value: string };

export function viewKey(v: NotesView): string {
  return "value" in v ? `${v.kind}:${v.value}` : v.kind;
}

export function viewLabel(v: NotesView): string {
  switch (v.kind) {
    case "all":
      return "All notes";
    case "inbox":
      return "Inbox";
    case "pinned":
      return "Pinned";
    case "private":
      return "Private";
    case "type":
      return NOTE_KINDS.find((k) => k.value === v.value)?.label ?? "Notes";
    case "tag":
      return `#${v.value}`;
  }
}

export function matchesView(n: TerritoryNoteFeedItem, v: NotesView): boolean {
  switch (v.kind) {
    case "all":
      return true;
    case "inbox":
      return n.note_type === "general";
    case "pinned":
      return n.pinned;
    case "private":
      return n.visibility === "private";
    case "type":
      return n.note_type === v.value;
    case "tag":
      return n.tags.some((t) => t.name === v.value);
  }
}

export interface Row {
  view: NotesView;
  label: string;
  count: number;
  Icon: LucideIcon;
  /** Only set for tag rows — the underlying territory_note_tags.id, needed to rename/delete it. */
  tagId?: string;
}

/** Only non-empty buckets, so the sidebar never advertises a filter that finds nothing. */
export function buildRows(notes: TerritoryNoteFeedItem[]): { top: Row[]; types: Row[]; tags: Row[] } {
  const count = (v: NotesView) => notes.filter((n) => matchesView(n, v)).length;

  const allRows: Row[] = [
    { view: { kind: "all" }, label: "All notes", count: notes.length, Icon: Layers },
    { view: { kind: "inbox" }, label: "Inbox", count: count({ kind: "inbox" }), Icon: Inbox },
    { view: { kind: "pinned" }, label: "Pinned", count: count({ kind: "pinned" }), Icon: Pin },
    { view: { kind: "private" }, label: "Private", count: count({ kind: "private" }), Icon: Lock },
  ];
  // "All notes" stays even at zero, so an empty notebook still has a home row.
  const top = allRows.filter((r) => r.view.kind === "all" || r.count > 0);

  const types: Row[] = NOTE_KINDS
    // 'general' is Inbox above; listing it twice would be the old problem again.
    .filter((k) => k.value !== "general")
    .map((k) => ({
      view: { kind: "type", value: k.value } as NotesView,
      label: k.label,
      count: notes.filter((n) => n.note_type === k.value).length,
      Icon: noteKindIcon(k.value),
    }))
    .filter((r) => r.count > 0);

  const tagCounts = new Map<string, { id: string; count: number }>();
  for (const n of notes) {
    for (const t of n.tags) {
      const existing = tagCounts.get(t.name);
      tagCounts.set(t.name, { id: t.id, count: (existing?.count ?? 0) + 1 });
    }
  }
  const tags: Row[] = [...tagCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([name, { id, count: c }]) => ({
      view: { kind: "tag", value: name } as NotesView,
      label: name,
      count: c,
      Icon: Hash,
      tagId: id,
    }));

  return { top, types, tags };
}
