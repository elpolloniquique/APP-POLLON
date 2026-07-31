import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Bike, Map, History, Wallet, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { unlockDriverAudio } from '../../utils/orderAlertSound';
import { APP_BUILD_ID } from '../../utils/buildStamp';

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

  // Desbloquear audio WebAudio en PWA instalada (gesto del usuario)
  useEffect(() => {
    const unlock = () => { unlockDriverAudio(); };
    unlock();
    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('click', unlock, opts);
    const onVis = () => {
      if (document.visibilityState === 'visible') unlockDriverAudio();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('touchstart', unlock, opts);
      window.removeEventListener('click', unlock, opts);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f5f5f5] text-gray-900" data-build={APP_BUILD_ID}>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img src="/img/logo pollon.png" alt="" className="h-10 w-10 rounded-full border border-gray-100 bg-white object-contain" />
          <div>
            <p className="font-display text-lg leading-none text-pollon-orange">EL POLLÓN</p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-600">Panel repartidor</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Salir"
          title={profile?.fullName || profile?.email || 'Salir'}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="relative flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,.06)]">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold ${
                  isActive ? 'text-pollon-orange' : 'text-gray-500'
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
