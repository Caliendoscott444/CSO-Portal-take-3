import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DiscordIcon } from '../Navbar';
import { ORG_ABBR } from '../../data';

export default function Login() {
  const { session, loading, signInWithDiscord } = useAuth();

  if (!loading && session) return <Navigate to="/portal" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl">
        <img
          src="/CSO_CORPORATION_LOGO_1-2.png"
          alt={`${ORG_ABBR} logo`}
          className="mx-auto h-14 w-14 object-contain brightness-0 invert opacity-90"
        />
        <h1 className="mt-5 text-xl font-bold text-white">Member Portal</h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Sign in with your Discord account to access your dashboard.
        </p>
        <button
          onClick={signInWithDiscord}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#4752c4] hover:-translate-y-0.5"
        >
          <DiscordIcon className="h-4 w-4" />
          Sign in with Discord
        </button>
      </div>
    </div>
  );
}
