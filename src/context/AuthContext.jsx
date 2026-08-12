import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
const STAFF_PROFILE_CACHE_KEY = 'ep_staff_profile_v1';
const SESSION_BOOT_TIMEOUT_MS = 6000;

function getCustomerLocal() {
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStaffProfileCache() {
  try {
    const raw = sessionStorage.getItem(STAFF_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const role = normalizeRole(p?.rol || p?.role);
    if (!isStaffRole(role)) return null;
    return p;
  } catch {
    return null;
  }
}

function writeStaffProfileCache(profile) {
  try {
    if (!profile) {
      sessionStorage.removeItem(STAFF_PROFILE_CACHE_KEY);
      return;
    }
    const role = normalizeRole(profile?.rol || profile?.role);
    if (isStaffRole(role)) {
      sessionStorage.setItem(STAFF_PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(STAFF_PROFILE_CACHE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function withTimeout(promise, ms, label = 'timeout') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(() => readStaffProfileCache());
  const [loading, setLoading] = useState(true);
  const profileUserIdRef = useRef(null);
  const profileCacheRef = useRef(null);
  const bootDoneRef = useRef(false);

  const refreshProfile = useCallback(async (user, { force = false } = {}) => {
    if (!user) {
      setProfile(null);
      profileUserIdRef.current = null;
      profileCacheRef.current = null;
      writeStaffProfileCache(null);
      return null;
    }
    if (
      !force
      && profileUserIdRef.current === user.id
      && profileCacheRef.current
      && isStaffRole(normalizeRole(profileCacheRef.current?.rol || profileCacheRef.current?.role))
    ) {
      setProfile(profileCacheRef.current);
      return profileCacheRef.current;
    }
    profileUserIdRef.current = user.id;
    const p = await getProfileByAuthIdSafe(user.id, user);
    const resolved = (p?.role && p.role !== 'cliente')
      ? p
      : (p || profileFromAuthUser(user));
    profileCacheRef.current = resolved;
    setProfile(resolved);
    writeStaffProfileCache(resolved);
    return resolved;
  }, []);

  useEffect(() => {
    const customerLocal = getCustomerLocal();
    if (customerLocal?.session) {
      setSession(customerLocal.session);
      setProfile(customerLocal.profile);
      setLoading(false);
      bootDoneRef.current = true;
      return undefined;
    }

    const legacy = getLegacySession();
    if (legacy?.session) {
      setSession(legacy.session);
      setProfile(legacy.profile);
      writeStaffProfileCache(legacy.profile);
      setLoading(false);
      bootDoneRef.current = true;
      return undefined;
    }

    // Si ya hay perfil staff en caché, no bloquear el shell con Loader eterno
    if (readStaffProfileCache()) {
      setLoading(false);
    }

    withTimeout(getSession(), SESSION_BOOT_TIMEOUT_MS, 'getSession-timeout')
      .then((s) => {
        setSession(s);
        if (s?.user) {
          setTimeout(() => {
            refreshProfile(s.user)
              .catch((err) => console.warn('[Pollón] boot profile:', err))
              .finally(() => {
                setLoading(false);
                bootDoneRef.current = true;
              });
          }, 0);
        } else {
          setLoading(false);
          bootDoneRef.current = true;
        }
      })
      .catch((err) => {
        console.warn('[Pollón] getSession:', err?.message || err);
        setLoading(false);
        bootDoneRef.current = true;
      });

    const sb = getSupabase();
    if (!sb) return undefined;

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, s) => {
      if (!s?.user) {
        if (event === 'SIGNED_OUT' && !getLegacySession() && !getCustomerLocal()) {
          setSession(null);
          setProfile(null);
          profileUserIdRef.current = null;
          writeStaffProfileCache(null);
        }
        return;
      }
      // INITIAL_SESSION suele duplicar el boot de getSession — saltar si ya cargamos ese user
      if (event === 'INITIAL_SESSION' && bootDoneRef.current && profileUserIdRef.current === s.user.id) {
        setSession(s);
        return;
      }
      setSession(s);
      setTimeout(() => {
        refreshProfile(s.user).catch((err) => console.warn('[Pollón] auth state profile:', err));
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = async (email, password) => {
    const result = await authSignIn(email, password);
    if (result?.legacy) {
      setSession(result.session);
      setProfile(result.profile);
      writeStaffProfileCache(result.profile);
      return { session: result.session, profile: result.profile };
    }
    const s = result?.session;
    const user = result?.user ?? s?.user;
    if (!s || !user) throw new Error('No se pudo iniciar sesión. Revisa email y contraseña.');
    setSession(s);
    profileUserIdRef.current = null;
    profileCacheRef.current = null;
    const p = await getProfileByAuthIdSafe(user.id, user);
    setProfile(p);
    writeStaffProfileCache(p);
    profileUserIdRef.current = user.id;
    profileCacheRef.current = p;
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
    profileUserIdRef.current = null;
    writeStaffProfileCache(null);
  };

  const requestPasswordReset = (email) => resetPassword(email);

  const role = normalizeRole(profile?.rol || profile?.role);
  const user = session?.user || null;
  const isStaff = session && (session.legacy && !session.customer) ? isStaffRole(role) : (profile ? isStaffRole(role) : false);
  const isCustomer = profile ? isCustomerRole(role) : (session?.customer === true);
  const isAuthenticated = !!session;

  const can = useCallback((perm) => {
    if (!session || !isStaff) return false;
    return hasPermission(role, perm);
  }, [session, isStaff, role]);

  const canAccessBranchCb = useCallback(
    (branchId) => canAccessBranch(profile, branchId),
    [profile],
  );

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    can,
    canAccessBranch: canAccessBranchCb,
    isConfigured: isSupabaseConfigured(),
    role,
    isStaff,
    isCustomer,
    isAuthenticated,
  }), [
    session,
    user,
    profile,
    loading,
    can,
    canAccessBranchCb,
    role,
    isStaff,
    isCustomer,
    isAuthenticated,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
