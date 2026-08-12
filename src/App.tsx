import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ApplyBanner from './components/ApplyBanner';
import ScrollGlow from './components/ScrollGlow';
import HomePage from './pages/HomePage';
import DivisionsPage from './pages/DivisionsPage';
import SubDivisionsPage from './pages/SubDivisionsPage';
import PersonnelPage from './pages/PersonnelPage';
import CommandPage from './pages/CommandPage';
import PartnersPage from './pages/PartnersPage';
import AboutPage from './pages/AboutPage';
import ApplicationsPage from './pages/ApplicationsPage';
import PicturesPage from './pages/PicturesPage';
import SuggestionsPage from './pages/SuggestionsPage';
import { AuthProvider } from './contexts/AuthContext';
import { isSupabaseConfigured } from './lib/supabaseClient';
import Login from './components/portal/Login';
import ProtectedRoute from './components/portal/ProtectedRoute';
import PortalLayout from './components/portal/PortalLayout';
import Dashboard from './components/portal/Dashboard';
import StartShift from './components/portal/StartShift';
import LeaveOfAbsence from './components/portal/LeaveOfAbsence';
import Ranks from './components/portal/Ranks';
import Roster from './components/portal/Roster';
import Admin from './components/portal/Admin';
import SubDivisionsManager from './components/portal/SubDivisionsManager';
import TranscriptView from './components/portal/TranscriptView';
import Profile from './components/portal/Profile';
import ComingSoon from './components/portal/ComingSoon';
import Pictures from './components/portal/Pictures';
import MediaManager from './components/portal/MediaManager';
import Applications from './components/portal/Applications';
import Units from './components/portal/Units';
import Leaderboard from './components/portal/Leaderboard';

function PublicSite({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ScrollGlow />
      <Navbar />
      <main className="relative z-10">{children}</main>
      <Footer />
      <ApplyBanner />
    </div>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <PortalLayout>{children}</PortalLayout>
    </ProtectedRoute>
  );
}

function MissingConfigScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">
          Configuration missing
        </p>
        <h1 className="mt-2 text-lg font-bold text-white">Supabase env vars not set</h1>
        <p className="mt-2 text-sm text-zinc-400">
          <code className="text-zinc-300">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-zinc-300">VITE_SUPABASE_ANON_KEY</code> weren't found in this
          build. Add them in your host's environment variable settings (not just a local .env
          file), then redeploy. See <code className="text-zinc-300">SETUP.md</code>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <MissingConfigScreen />;

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public site — separate pages, matching jcrp-mshp.com's structure */}
          <Route path="/" element={<PublicSite><HomePage /></PublicSite>} />
          <Route path="/applications" element={<PublicSite><ApplicationsPage /></PublicSite>} />
          <Route path="/divisions" element={<PublicSite><DivisionsPage /></PublicSite>} />
          <Route path="/subdivisions" element={<PublicSite><SubDivisionsPage /></PublicSite>} />
          <Route path="/personnel" element={<PublicSite><PersonnelPage /></PublicSite>} />
          <Route path="/command" element={<PublicSite><CommandPage /></PublicSite>} />
          <Route path="/partners" element={<PublicSite><PartnersPage /></PublicSite>} />
          <Route path="/about" element={<PublicSite><AboutPage /></PublicSite>} />
          <Route path="/pictures" element={<PublicSite><PicturesPage /></PublicSite>} />
          <Route path="/suggestions" element={<PublicSite><SuggestionsPage /></PublicSite>} />

          {/* Member portal — untouched */}
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<Portal><Dashboard /></Portal>} />
          <Route path="/portal/shifts" element={<Portal><StartShift /></Portal>} />
          <Route path="/portal/loa" element={<Portal><LeaveOfAbsence /></Portal>} />
          <Route path="/portal/profile" element={<Portal><Profile /></Portal>} />
          <Route path="/portal/roster" element={<Portal><Roster /></Portal>} />
          <Route path="/portal/subdivisions" element={<Portal><Units /></Portal>} />
          <Route path="/portal/leaderboard" element={<Portal><Leaderboard /></Portal>} />
          <Route path="/portal/applications" element={<Portal><Applications /></Portal>} />
          <Route path="/portal/ranks" element={<Portal><Ranks /></Portal>} />
          <Route path="/portal/media" element={<Portal><Pictures /></Portal>} />
          <Route path="/portal/media-manager" element={<Portal><MediaManager /></Portal>} />
          <Route path="/portal/admin" element={<Portal><Admin /></Portal>} />
          <Route path="/portal/admin/subdivisions" element={<Portal><SubDivisionsManager /></Portal>} />
          <Route path="/portal/transcripts/:ticketId" element={<Portal><TranscriptView /></Portal>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
