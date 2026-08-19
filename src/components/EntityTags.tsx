import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { createNoteTag, listNoteTags, tagEntity, listEntityTags, untagEntity } from "../lib/api";
import type { GraphEntityType, TerritoryNoteTag } from "../lib/types";

/**
 * Universal tag chips for any record — a case, an inventory item, a
 * facility, whatever. Draws from the same tag pool Notes already builds
 * (territory_note_tags), so a tag applied here shows up filtering Notes too,
 * and vice versa. That shared pool is what makes tags "universal" rather
 * than yet another per-feature label field.
 */
export default function EntityTags({
  entityType,
  entityId,
}: {
  entityType: GraphEntityType;
  entityId: string;
}) {
  const { profile } = useAuth();
  const [tags, setTags] = useState<TerritoryNoteTag[]>([]);
  const [allTags, setAllTags] = useState<TerritoryNoteTag[]>([]);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    listEntityTags(entityType, entityId)
      .then(setTags)
      .catch(() => setTags([]));
  }

  useEffect(refresh, [entityType, entityId]);

  useEffect(() => {
    if (!profile) return;
    listNoteTags(profile.territory_id)
      .then(setAllTags)
      .catch(() => setAllTags([]));
  }, [profile]);

  const available = allTags.filter((t) => !tags.some((x) => x.id === t.id));

  async function attach(tag: TerritoryNoteTag) {
    if (!profile) return;
    setBusy(true);
    try {
      await tagEntity({
        entity_type: entityType,
        entity_id: entityId,
        tag_id: tag.id,
        territory_id: profile.territory_id,
        created_by: profile.id,
      });
      refresh();
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function attachNew() {
    if (!profile || !draft.trim()) return;
    setBusy(true);
    try {
      const existing = allTags.find((t) => t.name.toLowerCase() === draft.trim().toLowerCase());
      const tag =
        existing ?? (await createNoteTag({ name: draft.trim(), territory_id: profile.territory_id, created_by: profile.id }));
      if (!existing) setAllTags((prev) => [...prev, tag]);
      await attach(tag);
    } finally {
      setBusy(false);
    }
  }

  async function remove(tagId: string) {
    setBusy(true);
    try {
      await untagEntity(entityType, entityId, tagId);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t.id}
          className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
        >
          <Link to={`/tag/${t.id}`} className="underline decoration-slate-700">
            {t.name}
          </Link>
          <button onClick={() => remove(t.id)} disabled={busy} aria-label={`Remove ${t.name}`}>
            <X className="h-3 w-3 text-slate-500" />
          </button>
        </span>
      ))}

      {picking ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {available.map((t) => (
            <button
              key={t.id}
              onClick={() => attach(t)}
              disabled={busy}
              className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 active:bg-slate-800"
            >
              {t.name}
            </button>
          ))}
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") attachNew();
              if (e.key === "Escape") setPicking(false);
            }}
            placeholder="New tag…"
            className="w-24 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500"
          />
          <button onClick={() => setPicking(false)} className="text-xs text-slate-500 underline">
            done
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-slate-700 px-2.5 py-1 text-xs text-slate-500 active:bg-slate-800"
        >
          <Tag className="h-3 w-3" /> Tag
        </button>
      )}
    </div>
  );
}
