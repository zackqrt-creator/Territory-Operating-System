import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import AlertStack from "./components/AlertStack";

/**
 * Everything but Login and Home loads on demand.
 *
 * The whole app was one 1.1 MB script, and a phone has to parse all of it
 * before it can draw anything -- including html5-qrcode, which only three
 * screens ever touch. That cost was paid on the way to Home, which is the
 * screen you open twenty times a day and the one where you are usually
 * standing in a hallway.
 *
 * Login and Home stay eager on purpose: they are the two first screens, and
 * making either wait on a second request would trade the parse cost for a
 * round trip on exactly the connection least able to afford one.
 *
 * The extra chunks are not a liability offline. The service worker's
 * globPatterns already precache every .js in the build, so an installed app
 * has all of them on disk before it is ever needed -- the split changes what
 * gets parsed on launch, not what gets downloaded.
 */
const Calendar = lazy(() => import("./pages/Calendar"));
const AddCase = lazy(() => import("./pages/AddCase"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Scan = lazy(() => import("./pages/Scan"));
const StagingReport = lazy(() => import("./pages/StagingReport"));
const LoanerReturns = lazy(() => import("./pages/LoanerReturns"));
const ActivityFeed = lazy(() => import("./pages/ActivityFeed"));
const PackList = lazy(() => import("./pages/PackList"));
const Surgeons = lazy(() => import("./pages/Surgeons"));
const Readiness = lazy(() => import("./pages/Readiness"));
const TeamBoard = lazy(() => import("./pages/TeamBoard"));
const QaWall = lazy(() => import("./pages/QaWall"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Billing = lazy(() => import("./pages/Billing"));
const Tasks = lazy(() => import("./pages/Tasks"));
const RunSheet = lazy(() => import("./pages/RunSheet"));
const Sets = lazy(() => import("./pages/Sets"));
const DailyReports = lazy(() => import("./pages/DailyReports"));
const DailyReportEditor = lazy(() => import("./pages/DailyReportEditor"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Notes = lazy(() => import("./pages/Notes"));
const NoteDetail = lazy(() => import("./pages/NoteDetail"));
const SecondBrainQueue = lazy(() => import("./pages/SecondBrainQueue"));
const Knowledge = lazy(() => import("./pages/Wiki"));
const NotePage = lazy(() => import("./pages/WikiPage"));
const Trends = lazy(() => import("./pages/Trends"));
const Assistant = lazy(() => import("./pages/Assistant"));
const EntityPage = lazy(() => import("./pages/EntityPage"));

/** Legacy /wiki/:id bookmarks now live under /pages/:id. */
function WikiRedirect() {
  const { id } = useParams();
  return <Navigate to={`/pages/${id}`} replace />;
}

/**
 * Deliberately almost nothing. A chunk that is already on disk resolves in a
 * frame or two, so a spinner would be a flash of noise; the only time this is
 * visible for long is a first-ever visit on bad signal, and a quiet line beats
 * a spinner that implies something is stuck.
 */
function RouteFallback() {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">Loading...</div>;
}

function App() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-slate-400">
        Setting up your account... if this doesn't finish in a few seconds, refresh the page.
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cases" element={<Calendar />} />
          <Route path="/cases/new" element={<AddCase />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/staging" element={<StagingReport />} />
          <Route path="/loaners" element={<LoanerReturns />} />
          <Route path="/activity" element={<ActivityFeed />} />
          <Route path="/pack-list" element={<PackList />} />
          <Route path="/surgeons" element={<Surgeons />} />
          <Route path="/readiness" element={<Readiness />} />
          <Route path="/team" element={<TeamBoard />} />
          <Route path="/qa" element={<QaWall />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/review" element={<SecondBrainQueue />} />
          <Route path="/notes/:id" element={<NoteDetail />} />
          <Route path="/pages" element={<Knowledge />} />
          <Route path="/pages/:id" element={<NotePage />} />
          <Route path="/runsheet" element={<RunSheet />} />
          <Route path="/sets" element={<Sets />} />
          <Route path="/daily" element={<DailyReports />} />
          <Route path="/daily/:id" element={<DailyReportEditor />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/entity/:type/:id" element={<EntityPage />} />
          <Route path="/wiki" element={<Navigate to="/pages" replace />} />
          <Route path="/wiki/:id" element={<WikiRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AlertStack />
      <BottomNav />
    </>
  );
}

export default App;
