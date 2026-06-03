import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useCompactAdmin } from '../../hooks/useCompactAdmin';
import { ADMIN_NAV } from '../../utils/constants';
import { LogOut, Menu, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

export function AdminLayout() {
  const { profile, signOut, can, role } = useAuth();
  const { branchName, isBranchScoped, branchId } = useStaffBranch();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isCompact, isMobile, useDrawerSidebar } = useCompactAdmin();

  const nav = useMemo(() => ADMIN_NAV.filter((n) => can(n.perm)), [can, role]);

  const currentPageLabel = useMemo(() => {
    const match = nav.find((item) =>
      item.path === '/admin'
        ? location.pathname === '/admin'
        : location.pathname.startsWith(item.path),
    );
    return match?.label || 'Administración';
  }, [nav, location.pathname]);

  useEffect(() => {
    if (useDrawerSidebar) {
      setSidebarOpen(false);
    }
  }, [location.pathname, useDrawerSidebar]);

  const roleLabels = {
    super_admin: 'Super Admin',
    admin_sucursal: 'Admin sucursal',
    cajera: 'Cajera',
    cocina: 'Cocina',
    delivery: 'Delivery',
  };
  const roleLabel = roleLabels[role] || role;

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div
      className={`admin-layout flex min-h-[100dvh] bg-gray-100 ${isCompact ? 'admin-layout--compact' : ''} ${isMobile ? 'admin-layout--mobile' : ''}`}
    >
      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(100%,17.5rem)] flex-col bg-pollon-black text-white shadow-xl transition-transform duration-200 ${
          useDrawerSidebar && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'
        } ${!useDrawerSidebar ? 'admin-sidebar--static' : ''}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/img/logo pollon.png" alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-contain sm:h-10 sm:w-10" />
            <div className="min-w-0">
              <p className="truncate font-display text-base text-pollon-orange sm:text-lg">EL POLLÓN</p>
              <p className="text-[10px] text-white/60 sm:text-xs">Panel administrativo</p>
            </div>
          </div>
          {useDrawerSidebar && (
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-white/10"
              onClick={closeSidebar}
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2 admin-scroll-panel">
          {nav.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => { if (useDrawerSidebar) closeSidebar(); }}
              className={({ isActive }) =>
                `admin-sidebar__link mb-0.5 block rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
                  isActive ? 'bg-pollon-red text-white' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3 sm:p-4">
          <p className="truncate text-[10px] text-white/60 sm:text-xs">{profile?.email}</p>
          <p className="text-[10px] font-medium text-pollon-orange sm:text-xs">{roleLabel}</p>
          {isBranchScoped && (
            <p className="mt-0.5 truncate text-[10px] text-white/70 sm:text-xs">
              {branchId ? `Local: ${branchName}` : '⚠ Sin sucursal asignada'}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex items-center gap-2 text-xs text-white/80 hover:text-white sm:text-sm"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {sidebarOpen && useDrawerSidebar && (
        <button
          type="button"
          className="admin-sidebar-backdrop fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
          onClick={closeSidebar}
          aria-label="Cerrar menú"
        />
      )}

      <div className="admin-shell flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b bg-white px-3 py-2 shadow-sm sm:gap-3 sm:px-4 sm:py-2.5">
          {useDrawerSidebar && (
            <button
              type="button"
              className="admin-menu-btn flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2 hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Administración</p>
            <h1 className="truncate text-sm font-bold text-pollon-black sm:text-base">{currentPageLabel}</h1>
          </div>
        </header>

        <main className="admin-main min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {isBranchScoped && !branchId && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:mb-4 sm:px-4 sm:text-sm">
              Tu cuenta no tiene sucursal asignada. Solo verás datos vacíos hasta que el super admin configure tu <code>branch_id</code> en Supabase.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
