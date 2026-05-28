import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import {
  getSession,
  getProfileByAuthIdSafe,
  profileFromAuthUser,
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
      return null;
    }
    const p = await getProfileByAuthIdSafe(user.id, user);
    if (p?.role && p.role !== 'cliente') {
      setProfile(p);
      return p;
    }
    if (p) {
      setProfile(p);
      return p;
    }
    const fallback = profileFromAuthUser(user);
    setProfile(fallback);
    return fallback;
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

    getSession().then((s) => {
      setSession(s);
      if (s?.user) {
        // Diferir: evita deadlock con signInWithPassword (bug conocido Supabase)
        setTimeout(() => {
          refreshProfile(s.user).finally(() => setLoading(false));
        }, 0);
      } else {
        setLoading(false);
      }
    });

    const sb = getSupabase();
    if (!sb) return undefined;

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          refreshProfile(s.user).catch((err) => console.warn('[Pollón] auth state profile:', err));
        }, 0);
      } else if (!getLegacySession() && !getCustomerLocal()) {
        setProfile(null);
      }
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
    const s = result?.session;
    const user = result?.user ?? s?.user;
    if (!s || !user) throw new Error('No se pudo iniciar sesión. Revisa email y contraseña.');
    setSession(s);
    const p = await getProfileByAuthIdSafe(user.id, user);
    setProfile(p);
    return { session: s, profile: p };
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
