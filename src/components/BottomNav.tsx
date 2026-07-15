import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/cases", label: "Calendar", icon: "📅", end: false },
  { to: "/staging", label: "Staging", icon: "🚚", end: false },
  { to: "/pack-list", label: "Pack", icon: "🧳", end: false },
  { to: "/inventory", label: "Inventory", icon: "📦", end: false },
  { to: "/scan", label: "Scan", icon: "📷", end: false },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg px-1">
        {tabs.map((tab) => (
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
                  className={`flex h-8 w-14 items-center justify-center rounded-full text-xl leading-none transition-colors ${
                    isActive ? "bg-sky-500/15" : "bg-transparent"
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
