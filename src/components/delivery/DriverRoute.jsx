import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/Loader';
import { isDriverRole, normalizeRole } from '../../services/authService';

/** Solo rol delivery / repartidor. No redirigir mientras el perfil aún carga. */
export function DriverRoute({ children }) {
  const { session, profile, loading, role, user } = useAuth();
  const [waitExpired, setWaitExpired] = useState(false);

  useEffect(() => {
    if (profile || loading || !session) {
      setWaitExpired(false);
      return undefined;
    }
    const t = setTimeout(() => setWaitExpired(true), 10000);
    return () => clearTimeout(t);
  }, [profile, loading, session]);

  if (loading) return <Loader text="Cargando panel repartidor…" />;
  if (!session) return <Navigate to="/" replace state={{ openAuth: true }} />;

  const fromProfile = normalizeRole(profile?.rol || profile?.role || role);
  const fromMeta = normalizeRole(
    user?.user_metadata?.role
    || session?.user?.user_metadata?.role
  );

  // Sesión OK pero perfil aún null / fallback cliente: esperar un momento
  if (!profile && !isDriverRole(fromMeta)) {
    if (waitExpired) {
      return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
          <p className="text-sm text-white/80">No pudimos verificar tu cuenta de repartidor.</p>
          <button
            type="button"
            className="rounded-lg bg-[#c00000] px-4 py-2 text-sm font-bold"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return <Loader text="Verificando cuenta repartidor…" />;
  }

  if (isDriverRole(fromProfile) || isDriverRole(fromMeta)) {
    return children;
  }

  return <Navigate to="/admin" replace />;
}
