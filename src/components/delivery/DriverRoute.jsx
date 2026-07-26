import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/Loader';
import { isDriverRole, normalizeRole } from '../../services/authService';

/** Solo rol delivery / repartidor */
export function DriverRoute({ children }) {
  const { session, profile, loading, role } = useAuth();

  if (loading) return <Loader text="Cargando panel repartidor…" />;
  if (!session) return <Navigate to="/" replace state={{ openAuth: true }} />;

  const r = normalizeRole(profile?.rol || profile?.role || role);
  if (!isDriverRole(r)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
