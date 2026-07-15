import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listFacilities, listInventory } from "../lib/api";
import type { Facility, InventoryItem, ItemCategory } from "../lib/types";
import MoveItemSheet from "../components/MoveItemSheet";
import AddItemSheet from "../components/AddItemSheet";
import { daysUntil } from "../utils/dates";

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  loaner_kit: "Loaner kit",
  instrument_tray: "Instrument tray",
  implant: "Implant",
  consumable: "Consumable",
};

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);

  function refresh() {
    setLoading(true);
    return Promise.all([listInventory(), listFacilities()])
      .then(([i, f]) => {
        setItems(i);
        setFacilities(f);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = items.filter((i) => {
    if (locationFilter !== "all" && i.location_id !== locationFilter) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !i.name.toLowerCase().includes(q) && !(i.lot_number ?? "").toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const facilityName = (id: string) => facilities.find((f) => f.id === id)?.name ?? "—";

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          + Add
        </button>
      </div>

      <div className="mt-3 flex gap-4">
        <Link to="/loaners" className="inline-block text-sm text-sky-400">
          Loaner return countdown &rarr;
        </Link>
        <Link to="/activity" className="inline-block text-sm text-sky-400">
          Activity feed &rarr;
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or lot number..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <div className="flex gap-2">
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
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-400">No items match.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((item) => {
            const urgent = item.loaner_return_deadline && daysUntil(item.loaner_return_deadline) <= 2;
            return (
              <button
                key={item.id}
                onClick={() => setMoving(item)}
                className={`w-full rounded-lg border p-3 text-left active:bg-slate-800 ${
                  urgent ? "border-red-800 bg-red-950/30" : "border-slate-700 bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{item.name}</span>
                  <span className="text-xs text-slate-500">{CATEGORY_LABEL[item.category]}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-sm">
                  <span className="text-slate-400">{facilityName(item.location_id)}</span>
                  {item.lot_number && <span className="text-slate-500">Lot {item.lot_number}</span>}
                </div>
                {item.loaner_return_deadline && (
                  <p className={`mt-1 text-xs ${urgent ? "text-red-300" : "text-slate-500"}`}>
                    Return by {item.loaner_return_deadline}
                    {urgent ? ` (${daysUntil(item.loaner_return_deadline)}d)` : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {moving && (
        <MoveItemSheet
          item={moving}
          facilities={facilities}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            refresh();
          }}
        />
      )}

      {adding && (
        <AddItemSheet
          facilities={facilities}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
