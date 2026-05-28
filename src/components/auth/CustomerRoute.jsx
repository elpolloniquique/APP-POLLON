import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/Loader';

export function CustomerRoute({ children }) {
  const { session, loading, isCustomer, isStaff } = useAuth();

  if (loading) return <Loader text="Cargando cuenta…" />;
  if (!session) return <Navigate to="/" replace state={{ openAuth: true }} />;
  if (isStaff && !isCustomer) return <Navigate to="/admin" replace />;
  return children;
}
