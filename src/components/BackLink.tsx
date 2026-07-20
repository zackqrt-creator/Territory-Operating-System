import { useLocation, useNavigate } from "react-router-dom";

/**
 * Universal back affordance. Rendered globally for every route except Home,
 * so there's always a way back. Uses history when there's somewhere to go,
 * otherwise falls back to Home so it's never a dead end (e.g. a magic-link
 * cold open landing straight on a deep page).
 */
export default function BackLink() {
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname === "/") return null;

  function goBack() {
    if (window.history.length > 1) nav(-1);
    else nav("/");
  }

  return (
    <div className="px-4 pt-3" style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}>
      <button
        onClick={goBack}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 active:bg-slate-800"
      >
        <span className="text-lg leading-none">‹</span> Back
      </button>
    </div>
  );
}
