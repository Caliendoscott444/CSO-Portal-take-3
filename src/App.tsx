import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Departments from './components/Departments';
import Command from './components/Command';
import Businesses from './components/Businesses';
import About from './components/About';
import Footer from './components/Footer';
import { AuthProvider } from './contexts/AuthContext';
import { isSupabaseConfigured } from './lib/supabaseClient';
import Login from './components/portal/Login';
import ProtectedRoute from './components/portal/ProtectedRoute';
import PortalLayout from './components/portal/PortalLayout';
import Dashboard from './components/portal/Dashboard';
import StartShift from './components/portal/StartShift';
import LeaveOfAbsence from './components/portal/LeaveOfAbsence';
import ComingSoon from './components/portal/ComingSoon';

function PublicSite() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navbar />
      <main>
        <Hero />
        <Departments />
        <Command />
        <Businesses />
        <About />
      </main>
      <Footer />
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
          <Route path="/" element={<PublicSite />} />
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<Portal><Dashboard /></Portal>} />
          <Route path="/portal/shifts" element={<Portal><StartShift /></Portal>} />
          <Route path="/portal/loa" element={<Portal><LeaveOfAbsence /></Portal>} />
          <Route path="/portal/profile" element={<Portal><ComingSoon title="My Profile" /></Portal>} />
          <Route path="/portal/notifications" element={<Portal><ComingSoon title="Notifications" /></Portal>} />
          <Route path="/portal/roster" element={<Portal><ComingSoon title="Live Roster" /></Portal>} />
          <Route path="/portal/subdivisions" element={<Portal><ComingSoon title="Subdivisions" /></Portal>} />
          <Route path="/portal/applications" element={<Portal><ComingSoon title="Applications" /></Portal>} />
          <Route path="/portal/ranks" element={<Portal><ComingSoon title="Ranks" /></Portal>} />
          <Route path="/portal/media" element={<Portal><ComingSoon title="Pictures" /></Portal>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
