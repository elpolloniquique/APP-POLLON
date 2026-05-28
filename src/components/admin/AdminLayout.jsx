import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_NAV } from '../../utils/constants';
import { LogOut, Menu } from 'lucide-react';
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
    <div className="flex min-h-screen bg-gray-100">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-pollon-black text-white transition md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <img src="/img/logo pollon.png" alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          <div>
            <p className="font-display text-lg text-pollon-orange">EL POLLÓN</p>
            <p className="text-xs text-white/60">Panel administrativo</p>
          </div>
        </div>
        <nav className="p-2">
          {nav.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `mb-1 block rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-pollon-red text-white' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-4">
          <p className="truncate text-xs text-white/60">{profile?.email}</p>
          <p className="text-xs capitalize text-pollon-orange">{profile?.rol}</p>
          <button type="button" onClick={handleLogout} className="mt-2 flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button type="button" className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
          <button type="button" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold text-pollon-black">Administración</h1>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
