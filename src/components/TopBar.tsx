import { useLocation, useNavigate } from "react-router-dom";
import BrandMark from "./BrandMark";

/**
 * One consistent header across every screen but Home (which has its own
 * bigger brand treatment): back affordance + a small brand mark + the
 * current section's name, so the app reads as one product no matter which
 * of its ~25 pages you're on, instead of a pile of loose screens.
 */
const ROUTE_TITLES: { test: (path: string) => boolean; title: string }[] = [
  { test: (p) => p === "/cases", title: "Calendar" },
  { test: (p) => p === "/cases/new", title: "Add case" },
  { test: (p) => p === "/inventory", title: "Inventory" },
  { test: (p) => p === "/scan", title: "Scan" },
  { test: (p) => p === "/staging", title: "Staging report" },
  { test: (p) => p === "/loaners", title: "Loaner returns" },
  { test: (p) => p === "/activity", title: "Activity" },
  { test: (p) => p === "/pack-list", title: "Pack list" },
  { test: (p) => p === "/surgeons", title: "Surgeons" },
  { test: (p) => p === "/readiness", title: "Readiness" },
  { test: (p) => p === "/team", title: "Team board" },
  { test: (p) => p === "/qa", title: "Q&A" },
  { test: (p) => p === "/compliance", title: "Compliance" },
  { test: (p) => p === "/billing", title: "Billing" },
  { test: (p) => p === "/tasks", title: "Work" },
  { test: (p) => p === "/notes", title: "Knowledge" },
  { test: (p) => p === "/notes/review", title: "Review queue" },
  { test: (p) => p.startsWith("/notes/"), title: "Note" },
  { test: (p) => p === "/pages", title: "Knowledge base" },
  { test: (p) => p.startsWith("/pages/"), title: "Page" },
  { test: (p) => p === "/runsheet", title: "Run sheet" },
  { test: (p) => p === "/sets", title: "Sets & totes" },
  { test: (p) => p === "/procedures", title: "Procedures" },
];

function titleFor(pathname: string): string | null {
  return ROUTE_TITLES.find((r) => r.test(pathname))?.title ?? null;
}

export default function TopBar() {
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname === "/") return null;

  function goBack() {
    if (window.history.length > 1) nav(-1);
    else nav("/");
  }

  const title = titleFor(loc.pathname);

  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-800/80 bg-slate-950/85 px-3 backdrop-blur-xl"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <button
        onClick={goBack}
        className="flex min-h-0 items-center gap-1 rounded-lg px-2 py-2.5 text-sm font-medium text-slate-400 active:bg-slate-800"
      >
        <span className="text-lg leading-none">‹</span> Back
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 py-2.5">
        <BrandMark className="h-6 w-6" />
        {title && <span className="truncate text-sm font-semibold text-slate-200">{title}</span>}
      </div>
    </div>
  );
}
