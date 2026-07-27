import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Package,
  BookMarked,
  Boxes,
  ArrowLeftRight,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  listCatalogItems,
  listFacilities,
  listInventory,
  listProfiles,
  listRecentMovements,
  listToteTemplatesWithItems,
} from "../lib/api";
import type {
  CatalogItem,
  Facility,
  InventoryItem,
  ItemCategory,
  Movement,
  Profile,
  ToteTemplateWithItems,
} from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import LoanerDetailSheet from "../components/LoanerDetailSheet";
import EditItemSheet from "../components/EditItemSheet";
import { daysUntil, formatRelativeDay } from "../utils/dates";

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Efficiency",
};

type Tab = "onhand" | "catalog" | "sets" | "movements";

const TABS: { key: Tab; label: string; icon: typeof Package }[] = [
  { key: "onhand", label: "On-hand", icon: Package },
  { key: "catalog", label: "Catalog", icon: BookMarked },
  { key: "sets", label: "Sets", icon: Boxes },
  { key: "movements", label: "Movements", icon: ArrowLeftRight },
];

export default function Inventory() {
  const [tab, setTab] = useState<Tab>("onhand");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [sets, setSets] = useState<ToteTemplateWithItems[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState<Record<Tab, boolean>>({
    onhand: false,
    catalog: false,
    sets: false,
    movements: false,
  });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [viewingTote, setViewingTote] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);

  function refreshOnHand() {
    return Promise.all([listInventory(), listFacilities()]).then(([i, f]) => {
      setItems(i);
      setFacilities(f);
      setLoaded((l) => ({ ...l, onhand: true }));
    });
  }

  useEffect(() => {
    refreshOnHand().finally(() => setLoading(false));
  }, []);

  // Lazy-load each tab's data the first time it's opened.
  useEffect(() => {
    if (loaded[tab]) return;
    setLoading(true);
    const load =
      tab === "catalog"
        ? listCatalogItems().then((c) => setCatalog(c))
        : tab === "sets"
          ? listToteTemplatesWithItems().then((s) => setSets(s))
          : tab === "movements"
            ? Promise.all([
                listRecentMovements(100),
                listProfiles(),
                items.length ? Promise.resolve(items) : listInventory(),
                facilities.length ? Promise.resolve(facilities) : listFacilities(),
              ]).then(([m, p, i, f]) => {
                setMovements(m);
                setProfiles(p);
                if (!items.length) setItems(i);
                if (!facilities.length) setFacilities(f);
              })
            : Promise.resolve();
    load.then(() => setLoaded((l) => ({ ...l, [tab]: true }))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const facilityName = (id: string | null) => (id ? facilities.find((f) => f.id === id)?.name ?? "—" : "—");
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? "Item";
  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "Someone";

  const onHand = items.filter((i) => {
    if (i.loaner_tote_id) return false;
    if (locationFilter !== "all" && i.location_id !== locationFilter) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      !i.name.toLowerCase().includes(q) &&
      !(i.lot_number ?? "").toLowerCase().includes(q) &&
      !(i.loaner_code ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const catalogFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.item_number ?? "").toLowerCase().includes(q) ||
        (c.product_line ?? "").toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const setsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) => s.name.toLowerCase().includes(q));
  }, [sets, search]);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        {tab === "onhand" && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium ${
                tab === t.key ? "bg-slate-700 text-white" : "text-slate-400"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {(tab === "onhand" || tab === "catalog" || tab === "sets") && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "onhand"
                ? "Search name or lot…"
                : tab === "catalog"
                  ? "Search catalog name, REF, product line…"
                  : "Search sets…"
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 pl-9 pr-4 text-white placeholder:text-slate-500"
          />
        </div>
      )}

      {tab === "onhand" && (
        <div className="mt-2 flex gap-2">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="all">All locations</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && !loaded[tab] ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : tab === "onhand" ? (
        <OnHandList
          items={onHand}
          facilityName={facilityName}
          onTote={(it) => setViewingTote(it)}
          onMove={(it) => setMoving(it)}
        />
      ) : tab === "catalog" ? (
        <CatalogList items={catalogFiltered} total={catalog.length} />
      ) : tab === "sets" ? (
        <SetsList sets={setsFiltered} total={sets.length} />
      ) : (
        <MovementsList
          movements={movements}
          itemName={itemName}
          facilityName={facilityName}
          personName={personName}
        />
      )}

      {moving && (
        <MoveItemSheet
          item={moving}
          facilities={facilities}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            refreshOnHand();
          }}
          onEdit={() => {
            const it = moving;
            setMoving(null);
            setEditing(it);
          }}
        />
      )}
      {editing && (
        <EditItemSheet
          item={editing}
          facilities={facilities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshOnHand();
          }}
        />
      )}
      {viewingTote && (
        <LoanerDetailSheet
          tote={viewingTote}
          facilities={facilities}
          onClose={() => setViewingTote(null)}
          onMove={() => {
            const tote = viewingTote;
            setViewingTote(null);
            setMoving(tote);
          }}
        />
      )}
      {adding && (
        <AddItemSheet
          facilities={facilities}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            refreshOnHand();
          }}
        />
      )}
    </div>
  );
}

function OnHandList({
  items,
  facilityName,
  onTote,
  onMove,
}: {
  items: InventoryItem[];
  facilityName: (id: string | null) => string;
  onTote: (i: InventoryItem) => void;
  onMove: (i: InventoryItem) => void;
}) {
  if (items.length === 0) return <p className="mt-8 text-slate-400">No items match.</p>;
  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => {
        const urgent = item.loaner_return_deadline && daysUntil(item.loaner_return_deadline) <= 2;
        const isTote = !!item.loaner_code;
        const expDays = item.expiration_date ? daysUntil(item.expiration_date) : null;
        const expired = expDays !== null && expDays < 0;
        const expiringSoon = expDays !== null && expDays >= 0 && expDays <= 30;
        return (
          <button
            key={item.id}
            onClick={() => (isTote ? onTote(item) : onMove(item))}
            className={`w-full rounded-lg border p-3 text-left active:bg-slate-800 ${
              urgent || expired
                ? "border-red-800 bg-red-950/30"
                : expiringSoon
                  ? "border-amber-800 bg-amber-950/20"
                  : "border-slate-700 bg-slate-800/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-white">{item.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.acquisition_type === "loaner" ? (
                  <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                    Loaner
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    Consignment
                  </span>
                )}
                <span className="text-xs text-slate-500">{CATEGORY_LABEL[item.category]}</span>
              </div>
            </div>
            {isTote && item.loaner_code && (
              <p className="mt-0.5 font-mono text-xs tracking-wide text-amber-300/80">
                {item.loaner_code} · tap to see contents
              </p>
            )}
            <div className="mt-0.5 flex items-center justify-between text-sm">
              <span className="text-slate-400">
                {facilityName(item.location_id)}
                {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
              </span>
              {item.lot_number && <span className="text-slate-500">Lot {item.lot_number}</span>}
            </div>
            {(expired || expiringSoon) && (
              <p className={`mt-1 flex items-center gap-1 text-xs ${expired ? "text-red-300" : "text-amber-300"}`}>
                <AlertTriangle className="h-3 w-3" />
                {expired ? "Expired" : "Expires"} {item.expiration_date}
                {!expired && expDays !== null ? ` (${expDays}d)` : ""}
              </p>
            )}
            {item.loaner_return_deadline && (
              <p className={`mt-1 flex items-center gap-1 text-xs ${urgent ? "text-red-300" : "text-slate-500"}`}>
                <Clock className="h-3 w-3" />
                Return by {item.loaner_return_deadline}
                {urgent ? ` (${daysUntil(item.loaner_return_deadline)}d)` : ""}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CatalogList({ items, total }: { items: CatalogItem[]; total: number }) {
  if (total === 0)
    return (
      <p className="mt-8 text-slate-400">
        No catalog items yet. Load myOPS packing lists to populate the product catalog.
      </p>
    );
  if (items.length === 0) return <p className="mt-8 text-slate-400">No catalog items match.</p>;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-slate-500">{items.length} of {total} items</p>
      {items.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 font-medium text-white">{c.name}</span>
            {c.side && c.side !== "NA" && (
              <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                {c.side === "LEFT" ? "L" : "R"}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {c.item_number && <span className="font-mono text-slate-400">{c.item_number}</span>}
            {c.product_line && <span>· {c.product_line}</span>}
            {c.device_type && <span>· {c.device_type}</span>}
            {c.size_label && <span>· size {c.size_label}</span>}
            {c.cement_type && c.cement_type !== "NA" && <span>· {c.cement_type}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SetsList({ sets, total }: { sets: ToteTemplateWithItems[]; total: number }) {
  if (total === 0)
    return (
      <p className="mt-8 text-slate-400">
        No sets yet. Sets (trays/totes) come from myOPS packing lists.
      </p>
    );
  if (sets.length === 0) return <p className="mt-8 text-slate-400">No sets match.</p>;
  return (
    <div className="mt-4 space-y-2">
      {sets.map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 font-medium text-white">{s.name}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {s.tote_template_items.length} item{s.tote_template_items.length === 1 ? "" : "s"}
            </span>
          </div>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              s.reusable ? "bg-sky-900/50 text-sky-200" : "bg-amber-900/50 text-amber-200"
            }`}
          >
            {s.reusable ? "Instruments (reusable)" : "Implants (per-case)"}
          </span>
        </div>
      ))}
    </div>
  );
}

function MovementsList({
  movements,
  itemName,
  facilityName,
  personName,
}: {
  movements: Movement[];
  itemName: (id: string) => string;
  facilityName: (id: string | null) => string;
  personName: (id: string | null) => string;
}) {
  if (movements.length === 0) return <p className="mt-8 text-slate-400">No movements yet.</p>;
  return (
    <div className="mt-4 space-y-2">
      {movements.map((m) => (
        <div key={m.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="text-sm font-medium text-white">{itemName(m.item_id)}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-400">
            {facilityName(m.from_location)}
            <ArrowLeftRight className="h-3 w-3 text-slate-500" />
            {facilityName(m.to_location)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {personName(m.moved_by)} · {formatRelativeDay(m.created_at)}
            {m.note ? ` · ${m.note}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
