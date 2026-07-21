import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ensureCanonicalPage } from "../lib/api";
import type { PageEntityType } from "../lib/types";

/**
 * Opens (or creates on first tap) the canonical wiki page for a record —
 * the same button shape everywhere so surgeons, facilities, and sets all
 * reach the same linked-note graph the same way.
 */
export default function WikiLinkButton({
  entityType,
  entityId,
  title,
  label = "Wiki page",
  className = "",
}: {
  entityType: PageEntityType;
  entityId: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  async function onOpen() {
    if (!profile || opening) return;
    setOpening(true);
    try {
      const page = await ensureCanonicalPage(profile.territory_id, entityType, entityId, title, profile.id);
      navigate(`/wiki/${page.id}`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      onClick={onOpen}
      disabled={opening}
      className={`flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-3 py-2 text-xs font-medium text-sky-300 disabled:opacity-50 ${className}`}
    >
      🧠 {opening ? "Opening…" : label}
    </button>
  );
}
