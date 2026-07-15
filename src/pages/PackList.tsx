import { useEffect, useState } from "react";
import {
  listCasesInRange,
  listCatalogItems,
  listInventory,
  listSurgeonPreferences,
  listSurgeons,
  listToteTemplatesWithItems,
} from "../lib/api";
import type {
  CaseRow,
  CatalogItem,
  InventoryItem,
  Surgeon,
  SurgeonPreference,
  ToteTemplateWithItems,
} from "../lib/types";
import { buildPackList, type PackGroup, type PackLine, type PackStatus } from "../lib/packlist";
import { caseLabel } from "../lib/staging";
import { addDays, formatDateShort, tomorrow } from "../utils/dates";

const STATUS_STYLE: Record<PackStatus, string> = {
  ready: "border-slate-700 bg-slate-800/50",
  short: "border-amber-800 bg-amber-950/20",
  missing: "border-red-800 bg-red-950/30",
};

const STATUS_ICON: Record<PackStatus, string> = {
  ready: "✅",
  short: "⚠️",
  missing: "❌",
};

export default function PackList() {
  const [date, setDate] = useState(tomorrow());
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [preferences, setPreferences] = useState<SurgeonPreference[]>([]);
  const [totes, setTotes] = useState<ToteTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listCasesInRange(date, date),
      listSurgeons(),
      listSurgeonPreferences(),
      listToteTemplatesWithItems(),
      listInventory(),
      listCatalogItems(),
    ])
      .then(([c, s, p, t, i, cat]) => {
        setCases(c);
        setSurgeons(s);
        setPreferences(p);
        setTotes(t);
        setInventory(i);
        setCatalog(cat);
      })
      .finally(() => setLoading(false));
  }, [date]);

  const packList = buildPackList(cases, surgeons, preferences, totes, inventory, catalog);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-xl font-semibold text-white">Pack list</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every size you need to bring, by surgeon and side, checked against what's on hand.
      </p>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="px-2 py-1 text-xl text-slate-400">
          ‹
        </button>
        <span className="text-sm font-medium text-slate-200">{formatDateShort(date)}</span>
        <button onClick={() => setDate((d) => addDays(d, 1))} className="px-2 py-1 text-xl text-slate-400">
          ›
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : packList.groups.length === 0 ? (
        <p className="mt-8 text-slate-400">No knee or hip cases scheduled this day.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {packList.groups.map((group) => (
            <PackGroupCard key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function PackGroupCard({ group }: { group: PackGroup }) {
  const title = group.surgeon ? group.surgeon.name : "No surgeon on file";
  const sideLabel = group.side === "LEFT" ? "Left" : "Right";
  const typeLabel = group.surgeryType === "KNEE" ? "Knee" : "Hip";
  const allReady =
    group.implantLines.length > 0 && group.implantLines.every((l) => l.status === "ready");

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400">
            {sideLabel} {typeLabel} × {group.cases.length}
          </p>
          <p className="text-xs text-slate-500">{group.cases.map(caseLabel).join(", ")}</p>
        </div>
        {allReady && <span className="text-lg">✅</span>}
      </div>

      {group.unresolvedNote && (
        <p className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
          {group.unresolvedNote}
        </p>
      )}

      {group.instrumentAdvice.map((advice, i) => (
        <div key={i} className="mt-3 rounded-lg border border-sky-800 bg-sky-950/20 p-3">
          <p className="text-sm font-medium text-sky-200">{advice.toteTemplate.name}</p>
          <p className="text-sm text-sky-300">{advice.text}</p>
        </div>
      ))}

      {group.implantLines.length > 0 && <LayeredLines lines={group.implantLines} />}
    </div>
  );
}

function LayeredLines({ lines }: { lines: PackLine[] }) {
  const layers = new Map<number | null, PackLine[]>();
  for (const line of lines) {
    const list = layers.get(line.packLayer) ?? [];
    list.push(line);
    layers.set(line.packLayer, list);
  }

  return (
    <div className="mt-3 space-y-4">
      {[...layers.entries()].map(([layer, layerLines]) => (
        <div key={layer ?? "other"}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {layer ? `Layer ${layer}` : "Other"}
          </h3>
          <div className="space-y-2">
            {layerLines.map((line, i) => (
              <PackLineRow key={i} line={line} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PackLineRow({ line }: { line: PackLine }) {
  const item = line.catalogItem;
  const lots = [...new Set(line.matchedItems.map((i) => i.lot_number).filter((l): l is string => !!l))];

  return (
    <div className={`rounded-lg border p-3 ${STATUS_STYLE[line.status]}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">
            {STATUS_ICON[line.status]} {item.name}
            {item.size_label ? ` · Size ${item.size_label}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {item.product_line ? `${item.product_line} · ` : ""}
            need {line.requiredQty}, have {line.onHandQty}
          </p>
          {lots.length > 0 && <p className="text-xs text-slate-500">Lots: {lots.join(", ")}</p>}
        </div>
      </div>
    </div>
  );
}
