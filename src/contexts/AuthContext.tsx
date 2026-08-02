import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabaseClient';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  portalAccess: boolean | null;
  portalAccessReason: string | undefined;
  signInWithDiscord: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null);
  const [portalAccessReason, setPortalAccessReason] = useState<string | undefined>();

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
  }, []);

  const checkPortalAccess = useCallback(async () => {
    setPortalAccess(null);
    const { data, error } = await supabase.functions.invoke('check-portal-access');
    if (error) {
      setPortalAccess(false);
      setPortalAccessReason('Could not verify portal access. Please try again.');
      return;
    }
    setPortalAccess(Boolean(data?.eligible));
    setPortalAccessReason(data?.reason);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id);
        checkPortalAccess();
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        loadProfile(newSession.user.id);
        checkPortalAccess();
      } else {
        setProfile(null);
        setPortalAccess(null);
        setPortalAccessReason(undefined);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile, checkPortalAccess]);

  const signInWithDiscord = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/portal` },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        portalAccess,
        portalAccessReason,
        signInWithDiscord,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
