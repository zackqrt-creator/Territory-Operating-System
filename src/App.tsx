import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Calendar from "./pages/Calendar";
import AddCase from "./pages/AddCase";
import Inventory from "./pages/Inventory";
import Scan from "./pages/Scan";
import StagingReport from "./pages/StagingReport";
import LoanerReturns from "./pages/LoanerReturns";
import ActivityFeed from "./pages/ActivityFeed";
import PackList from "./pages/PackList";
import Surgeons from "./pages/Surgeons";
import Readiness from "./pages/Readiness";
import TeamBoard from "./pages/TeamBoard";
import QaWall from "./pages/QaWall";
import Compliance from "./pages/Compliance";
import Billing from "./pages/Billing";
import Tasks from "./pages/Tasks";
import RunSheet from "./pages/RunSheet";
import Sets from "./pages/Sets";
import Notes from "./pages/Notes";
import NoteDetail from "./pages/NoteDetail";
import SecondBrainQueue from "./pages/SecondBrainQueue";
import Knowledge from "./pages/Wiki";
import NotePage from "./pages/WikiPage";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import OfflineBar from "./components/OfflineBar";

/** Legacy /wiki/:id bookmarks now live under /pages/:id. */
function WikiRedirect() {
  const { id } = useParams();
  return <Navigate to={`/pages/${id}`} replace />;
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
        <Route path="/wiki" element={<Navigate to="/pages" replace />} />
        <Route path="/wiki/:id" element={<WikiRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <OfflineBar />
      <BottomNav />
    </>
  );
}

export default App;
