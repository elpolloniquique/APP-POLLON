import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Bike, Map, History, Wallet, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { to: '/repartidor', end: true, icon: Bike, label: 'Pedidos' },
  { to: '/repartidor/mapa', icon: Map, label: 'Mapa' },
  { to: '/repartidor/historial', icon: History, label: 'Historial' },
  { to: '/repartidor/ingresos', icon: Wallet, label: 'Ingresos' },
  { to: '/repartidor/perfil', icon: User, label: 'Perfil' },
];

export function DriverLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mapFirst = location.pathname === '/repartidor' || location.pathname === '/repartidor/mapa';

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0B0F14] text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-[#0B0F14]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/img/logo pollon.png" alt="" className="h-9 w-9 rounded-full bg-white object-contain" />
          <div>
            <p className="font-display text-lg leading-none text-pollon-orange">EL POLLÓN</p>
            <p className="text-[10px] text-white/50">Panel repartidor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[140px] truncate text-xs text-white/70 sm:inline">
            {profile?.fullName || profile?.nombre || profile?.email}
          </span>
          <button type="button" onClick={handleLogout} className="rounded-lg p-2 hover:bg-white/10" aria-label="Salir">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className={`relative flex-1 ${mapFirst ? 'overflow-hidden pb-[4.25rem]' : 'overflow-y-auto pb-24'}`}>
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0B0F14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1">
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium ${
                  isActive ? 'text-pollon-orange' : 'text-white/50'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
