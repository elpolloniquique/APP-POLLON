import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_NAV } from '../../utils/constants';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

export function AdminLayout() {
  const { profile, signOut, can } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = ADMIN_NAV.filter((n) => can(n.perm));

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="flex min-h-[100dvh] bg-gray-100">
      {/* Sidebar — drawer móvil / fijo tablet+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100%,17rem)] flex-col bg-pollon-black text-white shadow-xl transition-transform duration-200 md:static md:z-auto md:w-56 md:shrink-0 md:translate-x-0 lg:w-64 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/img/logo pollon.png" alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-contain sm:h-10 sm:w-10" />
            <div className="min-w-0">
              <p className="truncate font-display text-base text-pollon-orange sm:text-lg">EL POLLÓN</p>
              <p className="text-[10px] text-white/60 sm:text-xs">Panel administrativo</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-white/10 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 admin-scroll-panel">
          {nav.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `mb-0.5 block rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
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
          <p className="text-[10px] capitalize text-pollon-orange sm:text-xs">{profile?.rol}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex items-center gap-2 text-xs text-white/80 hover:text-white sm:text-sm"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-gray-100 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="min-w-0 truncate text-base font-bold text-pollon-black sm:text-lg">Administración</h1>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 md:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
