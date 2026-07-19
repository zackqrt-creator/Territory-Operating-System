import { useEffect, useMemo, useState } from "react";
import {
  listAllEntityNotes,
  listFacilities,
  listInventory,
  listProfiles,
  listSurgeons,
  listUpcomingCases,
} from "../lib/api";
import type {
  CaseRow,
  EntityNote,
  Facility,
  InventoryItem,
  NoteEntityType,
  Profile,
  Surgeon,
} from "../lib/types";
import { formatDateShort, formatRelativeDay } from "../utils/dates";

const TYPE_META: Record<NoteEntityType, { label: string; icon: string }> = {
  case: { label: "Cases", icon: "📅" },
  surgeon: { label: "Surgeons", icon: "🩺" },
  facility: { label: "Facilities", icon: "🏥" },
  inventory_item: { label: "Items", icon: "📦" },
};

/**
 * Global notes search: every note the team has ever written, in one place,
 * searchable by text and filterable by what it's attached to. This is where
 * notes stop being storage and become retrieval.
 */
export default function NotesSearch() {
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<NoteEntityType | "all">("all");

  useEffect(() => {
    Promise.all([
      listAllEntityNotes(),
      listUpcomingCases(),
      listSurgeons(),
      listFacilities(),
      listInventory(),
      listProfiles(),
    ])
      .then(([n, c, s, f, i, p]) => {
        setNotes(n);
        setCases(c);
        setSurgeons(s);
        setFacilities(f);
        setItems(i);
        setProfiles(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const entityLabel = useMemo(() => {
    return (n: EntityNote): string => {
      if (n.entity_type === "surgeon") {
        return surgeons.find((s) => s.id === n.entity_id)?.name ?? "Surgeon";
      }
      if (n.entity_type === "facility") {
        return facilities.find((f) => f.id === n.entity_id)?.name ?? "Facility";
      }
      if (n.entity_type === "inventory_item") {
        return items.find((i) => i.id === n.entity_id)?.name ?? "Inventory item";
      }
      const c = cases.find((x) => x.id === n.entity_id);
      if (!c) return "Case";
      const type = c.surgery_type === "KNEE" ? "Knee" : c.surgery_type === "HIP" ? "Hip" : "Instr";
      return `${type}${c.side ? ` ${c.side === "LEFT" ? "L" : "R"}` : ""} · ${formatDateShort(c.surgery_date)}${c.surgeon ? ` · ${c.surgeon}` : ""}`;
    };
  }, [cases, surgeons, facilities, items]);

  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.display_name ?? "Someone";

  const filtered = notes.filter((n) => {
    if (typeFilter !== "all" && n.entity_type !== typeFilter) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      n.body.toLowerCase().includes(needle) || entityLabel(n).toLowerCase().includes(needle)
    );
  });

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">All notes</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every note the team has written — cases, surgeons, facilities, items — searchable in one
        place.
      </p>

      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search notes… (e.g. cement, door code, size 5)"
        className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTypeFilter("all")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            typeFilter === "all" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          All ({notes.length})
        </button>
        {(Object.keys(TYPE_META) as NoteEntityType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              typeFilter === t ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-400">
          {notes.length === 0 ? "No notes written yet." : "No notes match."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                <span>{TYPE_META[n.entity_type].icon}</span>
                <span className="truncate">{entityLabel(n)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
              <p className="mt-1 text-xs text-slate-500">
                {nameOf(n.author_id)} · {formatRelativeDay(n.created_at)}
                {n.updated_at ? " · edited" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
