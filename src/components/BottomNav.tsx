import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/cases", label: "Cases", icon: "📅", end: false },
  { to: "/inventory", label: "Inventory", icon: "📦", end: false },
  { to: "/scan", label: "Scan", icon: "📷", end: false },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-slate-800 bg-slate-900/95 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
              isActive ? "text-sky-400" : "text-slate-400"
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
