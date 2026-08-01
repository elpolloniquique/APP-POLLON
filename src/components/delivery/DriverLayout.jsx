import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { Bike, Map, History, Wallet, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { unlockDriverAudio } from '../../utils/orderAlertSound';
import { APP_BUILD_ID } from '../../utils/buildStamp';
import { DriverLiveTrackingOnboarding } from './DriverLiveTrackingOnboarding';
import { getMyDriverSummary, ensureMyDriverProfile } from '../../services/driverService';
import { subscribeDispatch } from '../../services/dispatchService';
import { setDriverAppBadge, clearDriverAppBadge, ensureDriverPushSubscription } from '../../services/pushService';

const TABS = [
  { to: '/repartidor', end: true, icon: Bike, label: 'Pedidos', badgeKey: 'offers' },
  { to: '/repartidor/mapa', icon: Map, label: 'Mapa' },
  { to: '/repartidor/historial', icon: History, label: 'Historial' },
  { to: '/repartidor/ingresos', icon: Wallet, label: 'Ingresos' },
  { to: '/repartidor/perfil', icon: User, label: 'Perfil' },
];

export function DriverLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [trackingReady, setTrackingReady] = useState(false);
  const [pendingOffers, setPendingOffers] = useState(0);

  const onReadyChange = useCallback((ready) => {
    setTrackingReady(Boolean(ready));
  }, []);

  const refreshBadge = useCallback(async () => {
    try {
      await ensureMyDriverProfile().catch(() => {});
      const s = await getMyDriverSummary();
      const n = (s?.pendingOffers || []).length;
      setPendingOffers(n);
      if (n > 0) await setDriverAppBadge(n);
      else await clearDriverAppBadge();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const unlock = () => { unlockDriverAudio(); };
    unlock();
    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('click', unlock, opts);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        unlockDriverAudio();
        refreshBadge();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('touchstart', unlock, opts);
      window.removeEventListener('click', unlock, opts);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshBadge]);

  useEffect(() => {
    if (!trackingReady) return undefined;
    refreshBadge();
    ensureDriverPushSubscription().catch(() => {});
    const unsub = subscribeDispatch(() => refreshBadge());
    const t = setInterval(refreshBadge, 6000);
    const onMsg = (event) => {
      if (event.data?.type === 'DRIVER_NEW_OFFER') refreshBadge();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMsg);
    }
    return () => {
      unsub();
      clearInterval(t);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMsg);
      }
    };
  }, [trackingReady, refreshBadge]);

  const handleLogout = async () => {
    await clearDriverAppBadge();
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f5f5f5] text-gray-900" data-build={APP_BUILD_ID}>
      <DriverLiveTrackingOnboarding onReadyChange={onReadyChange} />

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img src="/img/logo pollon.png" alt="" className="h-10 w-10 rounded-full border border-gray-100 bg-white object-contain" />
          <div>
            <p className="font-display text-lg leading-none text-pollon-orange">EL POLLÓN</p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-600">Panel repartidor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingOffers > 0 && (
            <span className="rounded-full bg-pollon-red px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {pendingOffers} nuevo{pendingOffers === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Salir"
            title={profile?.fullName || profile?.email || 'Salir'}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {trackingReady ? (
        <>
          <main className="relative flex-1 overflow-y-auto pb-24">
            <Outlet context={{ trackingReady, pendingOffers, refreshBadge }} />
          </main>

          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,.06)]">
            <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
              {TABS.map(({ to, end, icon: Icon, label, badgeKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold ${
                      isActive ? 'text-pollon-orange' : 'text-gray-500'
                    }`
                  }
                >
                  <span className="relative inline-flex">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                    {badgeKey === 'offers' && pendingOffers > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold leading-none text-white shadow ring-2 ring-white">
                        {pendingOffers > 9 ? '9+' : pendingOffers}
                      </span>
                    )}
                  </span>
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      ) : (
        <main className="relative flex-1" />
      )}
    </div>
  );
}
