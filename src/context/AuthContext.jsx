import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import {
  getSession,
  getProfileByAuthId,
  getLegacySession,
  signIn as authSignIn,
  signUpCustomer,
  signOut as authSignOut,
  resetPassword,
  hasPermission,
  isStaffRole,
  isCustomerRole,
  normalizeRole,
  canAccessBranch,
} from '../services/authService';
import { CUSTOMER_SESSION_KEY } from '../utils/constants';

const AuthContext = createContext(null);

function getCustomerLocal() {
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await getProfileByAuthId(user.id);
    if (p) {
      setProfile(p);
      return;
    }
    setProfile({
      id: user.id,
      email: user.email,
      fullName: user.email,
      nombre: user.email,
      rol: 'cliente',
      role: 'cliente',
    });
  }, []);

  useEffect(() => {
    const customerLocal = getCustomerLocal();
    if (customerLocal?.session) {
      setSession(customerLocal.session);
      setProfile(customerLocal.profile);
      setLoading(false);
      return;
    }

    const legacy = getLegacySession();
    if (legacy?.session) {
      setSession(legacy.session);
      setProfile(legacy.profile);
      setLoading(false);
      return;
    }

    getSession().then(async (s) => {
      setSession(s);
      if (s?.user) await refreshProfile(s.user);
      setLoading(false);
    });

    const sb = getSupabase();
    if (!sb) return undefined;

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s?.user) await refreshProfile(s.user);
      else if (!getLegacySession() && !getCustomerLocal()) setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = async (email, password) => {
    const result = await authSignIn(email, password);
    if (result?.legacy) {
      setSession(result.session);
      setProfile(result.profile);
      return { session: result.session, profile: result.profile };
    }
    const s = result?.session ?? result;
    setSession(s);
    if (s?.user) {
      await refreshProfile(s.user);
      return { session: s, profile: await getProfileByAuthId(s.user.id) };
    }
    return { session: s };
  };

  const signUp = async (data) => {
    const result = await signUpCustomer(data);
    if (result?.legacy) {
      setSession(result.session);
      setProfile(result.profile);
      return result;
    }
    if (result?.session) {
      setSession(result.session);
      if (result.session.user) await refreshProfile(result.session.user);
    }
    return result;
  };

  const signOut = async () => {
    await authSignOut();
    setSession(null);
    setProfile(null);
  };

  const requestPasswordReset = (email) => resetPassword(email);

  const role = normalizeRole(profile?.rol || profile?.role);
  const isStaff = session && (session.legacy && !session.customer) ? isStaffRole(role) : (profile ? isStaffRole(role) : false);
  const isCustomer = profile ? isCustomerRole(role) : (session?.customer === true);
  const isAuthenticated = !!session;

  const can = (perm) => {
    if (!session || !isStaff) return false;
    return hasPermission(role, perm);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        can,
        canAccessBranch: (branchId) => canAccessBranch(profile, branchId),
        isConfigured: isSupabaseConfigured(),
        role,
        isStaff,
        isCustomer,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
