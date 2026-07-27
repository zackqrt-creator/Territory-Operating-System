import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  Home,
  Calendar,
  Package,
  CheckSquare,
  NotebookPen,
  MoreHorizontal,
  Boxes,
  Truck,
  RotateCcw,
  Activity,
  ClipboardCheck,
  Stethoscope,
  Users,
  HelpCircle,
  Library,
  ScanLine,
  ListChecks,
  X,
  type LucideIcon,
} from "lucide-react";

const PRIMARY: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/cases", label: "Cases", icon: Calendar },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/notes", label: "Notes", icon: NotebookPen },
];

const MORE: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/runsheet", label: "Run sheet", icon: ListChecks },
  { to: "/staging", label: "Staging", icon: Truck },
  { to: "/pack-list", label: "Pack list", icon: Boxes },
  { to: "/sets", label: "Sets & totes", icon: Boxes },
  { to: "/loaners", label: "Loaner returns", icon: RotateCcw },
  { to: "/readiness", label: "Readiness", icon: ClipboardCheck },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/surgeons", label: "Surgeons", icon: Stethoscope },
  { to: "/team", label: "Team board", icon: Users },
  { to: "/qa", label: "Q&A", icon: HelpCircle },
  { to: "/pages", label: "Knowledge base", icon: Library },
  { to: "/scan", label: "Scan", icon: ScanLine },
];

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const loc = useLocation();
  const moreActive = MORE.some((m) => loc.pathname === m.to || loc.pathname.startsWith(m.to + "/"));

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg px-1">
          {PRIMARY.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
                    isActive ? "font-semibold text-sky-300" : "font-medium text-slate-500"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                        isActive ? "bg-sky-500/15" : "bg-transparent"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {tab.label}
                  </>
                )}
              </NavLink>
            );
          })}
          <button
            onClick={() => setShowMore(true)}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
              moreActive ? "font-semibold text-sky-300" : "font-medium text-slate-500"
            }`}
          >
            <span
              className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                moreActive ? "bg-sky-500/15" : "bg-transparent"
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
            </span>
            More
          </button>
        </div>
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowMore(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
            style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">More</h2>
              <button onClick={() => setShowMore(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MORE.map((m) => {
                const Icon = m.icon;
                return (
                  <Link
                    key={m.to}
                    to={m.to}
                    onClick={() => setShowMore(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/50 px-2 py-3 text-center active:bg-slate-800"
                  >
                    <Icon className="h-5 w-5 text-sky-300" />
                    <span className="text-[11px] font-medium leading-tight text-slate-300">{m.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
