import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/Loader';
import { isDriverRole, normalizeRole } from '../../services/authService';

/** Solo rol delivery / repartidor. No redirigir mientras el perfil aún carga. */
export function DriverRoute({ children }) {
  const { session, profile, loading, role, user } = useAuth();

  if (loading) return <Loader text="Cargando panel repartidor…" />;
  if (!session) return <Navigate to="/" replace state={{ openAuth: true }} />;

  const fromProfile = normalizeRole(profile?.rol || profile?.role || role);
  const fromMeta = normalizeRole(
    user?.user_metadata?.role
    || session?.user?.user_metadata?.role
  );

  // Sesión OK pero perfil aún null / fallback cliente: esperar un momento
  if (!profile && !isDriverRole(fromMeta)) {
    return <Loader text="Verificando cuenta repartidor…" />;
  }

  if (isDriverRole(fromProfile) || isDriverRole(fromMeta)) {
    return children;
  }

  return <Navigate to="/admin" replace />;
}
