import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/Loader';
import { isStaffRole, normalizeRole } from '../../services/authService';

export function ProtectedRoute({ children, perm }) {
  const { session, profile, loading, can } = useAuth();

  if (loading) return <Loader text="Verificando sesión…" />;
  if (!session) return <Navigate to="/admin/login" replace />;

  const role = normalizeRole(profile?.rol || profile?.role);
  if (!isStaffRole(role) && !session.legacy) {
    return <Navigate to="/cuenta" replace />;
  }

  if (perm && !can(perm)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
