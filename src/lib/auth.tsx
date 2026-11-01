import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(session: Session | null): Promise<Profile | null> {
  if (!session) return null;
  const { data: u } = await supabase
    .from('users')
    .select('id_user, auth_uid, full_name, email, role')
    .eq('auth_uid', session.user.id)
    .maybeSingle();
  if (!u) return null;

  const profile: Profile = {
    authUid: u.auth_uid,
    userId: u.id_user,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    agencyId: null,
    agencyName: null,
    photographerId: null,
    photographerStatus: null,
    photographerCity: null,
  };

  if (u.role === 'agency') {
    const { data: a } = await supabase.from('agency').select('id_agency, agency_name').eq('id_user', u.id_user).maybeSingle();
    profile.agencyId = a?.id_agency ?? null;
    profile.agencyName = a?.agency_name ?? null;
  }
  if (u.role === 'photographer') {
    const { data: p } = await supabase.from('photographer').select('id_photographer, status, city').eq('id_user', u.id_user).maybeSingle();
    profile.photographerId = p?.id_photographer ?? null;
    profile.photographerStatus = p?.status ?? null;
    profile.photographerCity = p?.city ?? null;
  }
  return profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setProfile(await loadProfile(data.session));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(await loadProfile(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      setProfile(await loadProfile(next));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
