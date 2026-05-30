import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AdminDashboard } from '../../pages/admin/AdminDashboard';
import { Loader } from '../ui/Loader';
import { getDefaultAdminPath, hasPermission, isStaffRole, normalizeRole } from '../../services/authService';

export function ProtectedRoute({ children, perm }) {
  const { session, profile, loading, can, role } = useAuth();

  if (loading) return <Loader text="Verificando sesión…" />;
  if (!session) return <Navigate to="/admin/login" replace />;

  const normalizedRole = normalizeRole(profile?.rol || profile?.role || role);
  if (!isStaffRole(normalizedRole) && !session.legacy) {
    return <Navigate to="/cuenta" replace />;
  }

  if (perm && !can(perm)) {
    return <Navigate to={getDefaultAdminPath(normalizedRole)} replace />;
  }

  return children;
}

/** Pantalla inicial /admin — dashboard o redirección según rol. */
export function AdminHome() {
  const { loading, role, profile } = useAuth();

  if (loading) return <Loader text="Cargando panel…" />;

  const normalizedRole = normalizeRole(profile?.rol || profile?.role || role);
  if (hasPermission(normalizedRole, 'dashboard')) {
    return <AdminDashboard />;
  }

  return <Navigate to={getDefaultAdminPath(normalizedRole)} replace />;
}
