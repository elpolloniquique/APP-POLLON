import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingCart, Phone, User, MapPin, ChevronDown, Menu, X,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useBranch } from '../../context/BranchContext';
import { useBranchMenu, prefetchBranchMenus } from '../../context/BranchMenuContext';
import { useAuth } from '../../context/AuthContext';
import { isBranchOpenNow } from '../../services/branchService';
import { money, storeCategoryUrl } from '../../utils/format';
import { AuthModal } from '../auth/AuthModal';
import { HeaderCategoryNav } from './HeaderCategoryNav';

function selectBranchWithCartConfirm(b, branch, setBranch, resetForBranch, items, cartBranchId, onDone, syncBranchUrl) {
  if (!b || b.comingSoon) return;
  if (b.id === branch?.id) { onDone?.(); return; }
  if (items.length > 0 && cartBranchId && cartBranchId !== b.id) {
    if (!window.confirm('Al cambiar de sucursal se vaciará tu carrito actual. ¿Deseas continuar?')) return;
    resetForBranch(b.id);
  }
  setBranch(b);
  syncBranchUrl?.(b);
  prefetchBranchMenus([b.id]);
  onDone?.();
}

const NAV_HOME = { label: 'INICIO', path: '/', categoryId: null };

function buildNavMenu(categories, branchId) {
  return [
    NAV_HOME,
    ...categories.map((c) => ({
      label: c.name,
      path: storeCategoryUrl(c.id, branchId),
      categoryId: c.id,
      slug: c.slug,
    })),
  ];
}

function formatSchedule(branch) {
  const raw = branch?.schedule || branch?.opening_hours;
  if (raw && raw.length > 10) {
    return raw.replace('Lun-Dom:', 'Lun – Dom:').replace('11:30 - 23:00', '11:30 a.m. – 11:00 p.m.');
  }
  return 'Lun – Dom: 11:30 a.m. – 11:00 p.m.';
}

function branchShortName(branch) {
  if (!branch?.name) return 'Seleccionar';
  return branch.name
    .replace(/^El Pollón\s*[—–-]?\s*/i, '')
    .replace(/^Pollón\s*[—–-]?\s*/i, '')
    .trim() || branch.city || 'Sucursal';
}

/** Etiqueta móvil: "Arica — Santa María" */
function branchMobileLabel(branch) {
  if (!branch?.name) return 'Seleccionar';
  return branch.name
    .replace(/^El Pollón\s*/i, '')
    .replace(/^Pollón\s*/i, '')
    .trim()
    .replace(/\s*[-–]\s*/g, ' — ');
}

function isNavActive(item, location) {
  if (item.path === '/') return location.pathname === '/';
  if (location.pathname !== '/tienda') return false;
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat');
  return cat === item.categoryId || cat === item.slug;
}

function BranchDropdown({
  branch, branches, branchLabel, branchOpen, setBranchOpen,
  items, cartBranchId, setBranch, resetForBranch, syncBranchUrl,
  variant = 'desktop',
}) {
  const isMobile = variant === 'mobile';

  return (
    <div className={`relative ${isMobile ? 'w-full min-w-0' : 'max-w-[280px] xl:max-w-xs'}`}>
      {isMobile ? (
        <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-pollon-red">
          Elige tu sucursal
        </p>
      ) : (
        <p className="mb-1.5 text-sm font-semibold text-gray-600">Sucursal actual:</p>
      )}
      <button
        type="button"
        onClick={() => {
          const next = !branchOpen;
          setBranchOpen(next);
          if (next) prefetchBranchMenus(branches.map((x) => x.id));
        }}
        className={`flex w-full items-center rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:border-pollon-red/40 ${
          isMobile ? 'gap-1.5 px-2.5 py-2' : 'gap-2.5 px-4 py-2.5'
        }`}
      >
        <MapPin className={`shrink-0 text-pollon-red ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} strokeWidth={2.5} />
        <span className={`min-w-0 flex-1 truncate font-bold text-gray-900 ${isMobile ? 'text-xs' : 'text-base'}`}>
          {branchLabel}
        </span>
        <ChevronDown className={`shrink-0 text-gray-400 transition ${branchOpen ? 'rotate-180' : ''} ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
      </button>
      {!isMobile && (
        <Link
          to="/sucursal"
          onClick={() => setBranchOpen(false)}
          className="mt-1.5 inline-block text-sm font-semibold text-pollon-red hover:underline"
        >
          Cambiar sucursal
        </Link>
      )}
      {branchOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setBranchOpen(false)} aria-hidden />
          <div className={`absolute left-0 right-0 top-full z-[70] mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-2xl ${isMobile ? 'min-w-[200px]' : ''}`}>
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={b.comingSoon}
                onClick={() => selectBranchWithCartConfirm(
                  b, branch, setBranch, resetForBranch, items, cartBranchId,
                  () => setBranchOpen(false),
                  syncBranchUrl,
                )}
                className={`block w-full px-4 py-3 text-left text-base hover:bg-red-50 disabled:opacity-40 ${
                  branch?.id === b.id ? 'bg-red-50 font-bold text-pollon-red' : 'text-gray-800'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SiteHeader({ onOpenCart, variant = 'full' }) {
  const { itemCount, subtotal, items, cartBranchId, resetForBranch } = useCart();
  const { branch, branches, setBranch } = useBranch();
  const { categories } = useBranchMenu();
  const navMenu = buildNavMenu(categories, branch?.id);
  const { isAuthenticated, isCustomer, isStaff, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());
  const [branchOpen, setBranchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState('login');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (location.state?.openAuth) {
      setAuthOpen(true);
      setAuthTab('login');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setBranchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const dateStrDesktop = now.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateStrMobile = now.toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const timeStr = now.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const isOpen = branch ? isBranchOpenNow(branch) : false;
  const branchLabelDesktop = branchShortName(branch);
  const branchLabelMobile = branchMobileLabel(branch);
  const scheduleText = formatSchedule(branch);
  const phoneDisplay = branch?.phone || '+56 9 8692 5310';
  const showNav = variant === 'full';

  const handleAccountClick = (tab = 'login') => {
    if (isAuthenticated && isCustomer) {
      navigate('/cuenta');
      setMobileOpen(false);
      return;
    }
    if (isAuthenticated && isStaff) {
      navigate('/admin');
      setMobileOpen(false);
      return;
    }
    setAuthTab(tab);
    setAuthOpen(true);
    setMobileOpen(false);
  };

  const statusBadgeClass = (mobile) =>
    `header-top-bar__status shrink-0 rounded-full font-extrabold uppercase tracking-wide ${
      isOpen ? 'bg-[#4ade80] text-black shadow-sm' : 'bg-white/20 text-white'
    } ${mobile ? 'header-top-bar__status--mobile' : ''}`;

  const syncBranchUrl = useCallback((b) => {
    if (!b?.id || location.pathname !== '/tienda') return;
    const params = new URLSearchParams(location.search);
    if (params.get('branch') === b.id) return;
    params.set('branch', b.id);
    navigate(
      { pathname: '/tienda', search: params.toString(), hash: location.hash },
      { replace: true },
    );
  }, [location.pathname, location.search, location.hash, navigate]);

  const branchDropdownProps = {
    branch,
    branches,
    branchOpen,
    setBranchOpen,
    items,
    cartBranchId,
    setBranch,
    resetForBranch,
    syncBranchUrl,
  };

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
      <header className="header-text-crisp sticky top-0 z-50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">

        {/* ═══════════════ MÓVIL: barra superior ═══════════════ */}
        <div className="bg-pollon-red text-white lg:hidden">
          <div className="header-top-bar flex items-center justify-between gap-1.5 px-3 text-xs leading-snug sm:text-[13px]">
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 tabular-nums font-medium">
              <span className="capitalize">{dateStrMobile}</span>
              <span className="text-white/50">|</span>
              <span className="font-bold">{timeStr}</span>
            </div>
            <p className="min-w-0 flex-1 truncate px-1 text-center text-[10px] font-medium text-white sm:text-xs">
              Horario: {scheduleText}
            </p>
            <span className={statusBadgeClass(true)}>
              {isOpen ? 'ABIERTO' : 'CERRADO'}
            </span>
          </div>
        </div>

        {/* ═══════════════ PC: barra superior ═══════════════ */}
        <div className="hidden bg-pollon-red text-white lg:block">
          <div className="header-top-bar mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 text-[13px] font-medium lg:text-sm">
            <div className="flex items-center gap-3">
              <span className="capitalize">{dateStrDesktop}</span>
              <span className="text-white/40">|</span>
              <span className="font-bold tabular-nums">{timeStr}</span>
            </div>
            <p className="flex-1 text-center text-sm lg:text-base">
              <span className="text-white/80">Horario de atención: </span>
              <span className="font-semibold">{scheduleText}</span>
            </p>
            <span className={statusBadgeClass(false)}>
              {isOpen ? 'ABIERTO' : 'CERRADO'}
            </span>
          </div>
        </div>

        {/* ═══════════════ MÓVIL: barra principal (logo | sucursal | carrito+menú) ═══════════════ */}
        <div className="border-b border-gray-100 bg-white lg:hidden">
          <div className="flex items-stretch gap-1.5 px-2 py-2.5">
            <Link to="/" className="flex shrink-0 items-center gap-1.5">
              <img
                src="/img/logo pollon.png"
                alt="El Pollón"
                className="h-10 w-10 rounded-full border border-pollon-red/30 object-contain p-0.5"
              />
              <div className="min-w-0">
                <p className="font-brand text-base leading-none font-bold text-pollon-red">El Pollón</p>
                <p className="font-brand text-[10px] font-semibold leading-tight text-pollon-gold sm:text-xs">Sabor Peruano</p>
              </div>
            </Link>

            <div className="flex min-w-0 flex-1 items-center justify-center px-0.5">
              <BranchDropdown
                {...branchDropdownProps}
                branchLabel={branchLabelMobile}
                variant="mobile"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onOpenCart}
                className="relative flex h-10 w-10 items-center justify-center"
                aria-label="Mi pedido"
              >
                <ShoppingCart className="h-7 w-7 text-pollon-red" strokeWidth={2} />
                {itemCount > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-pollon-red text-[9px] font-bold text-white ring-2 ring-white">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </button>
              {showNav && (
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm"
                  aria-label="Abrir menú"
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════ PC: barra principal blanca ═══════════════ */}
        <div className="hidden border-b border-gray-100 bg-white lg:block">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3.5">
            <Link to="/" className="flex shrink-0 items-center gap-3">
              <img
                src="/img/logo pollon.png"
                alt="El Pollón"
                className="h-14 w-14 rounded-full border-2 border-pollon-red/30 object-contain p-0.5"
              />
              <div>
                <p className="font-brand text-3xl leading-none font-bold text-pollon-red">El Pollón</p>
                <p className="font-brand mt-1 text-base font-semibold text-pollon-gold">Sabor Peruano</p>
              </div>
            </Link>

            <div className="hidden min-w-0 flex-1 justify-center px-4 lg:flex">
              <BranchDropdown
                {...branchDropdownProps}
                branchLabel={branchLabelDesktop}
                variant="desktop"
              />
            </div>

            <a href={`tel:${phoneDisplay.replace(/\s/g, '')}`} className="hidden shrink-0 items-center gap-3 lg:flex">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-pollon-red text-pollon-red">
                <Phone className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-base font-bold text-gray-900">{phoneDisplay}</p>
                <p className="text-sm text-gray-600">Llámanos o escríbenos</p>
              </div>
            </a>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2">
                <User className="h-7 w-7 shrink-0 text-gray-700" strokeWidth={1.5} />
                {isAuthenticated && isCustomer ? (
                  <button
                    type="button"
                    onClick={() => handleAccountClick('login')}
                    className="text-left text-sm font-semibold text-pollon-red hover:underline"
                  >
                    {profile?.fullName || 'Mi cuenta'}
                  </button>
                ) : (
                  <div className="flex flex-col text-sm leading-snug">
                    <button type="button" onClick={() => handleAccountClick('login')} className="text-left font-semibold text-gray-800 hover:text-pollon-red">
                      Iniciar sesión
                    </button>
                    <button type="button" onClick={() => handleAccountClick('register')} className="text-left font-medium text-gray-600 hover:text-pollon-red">
                      Registrarse
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenCart}
                className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-red-50"
                aria-label="Mi pedido"
              >
                <div className="relative">
                  <ShoppingCart className="h-8 w-8 text-pollon-red" strokeWidth={2} />
                  {itemCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pollon-red px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {itemCount > 99 ? '99+' : itemCount}
                    </span>
                  )}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Mi pedido</p>
                  <p className="text-base font-bold text-gray-900">{money(subtotal)}</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {showNav && <HeaderCategoryNav items={navMenu} />}
      </header>

      {/* Menú hamburguesa (móvil / tablet < lg) */}
      {showNav && mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(100%,320px)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-pollon-red px-4 py-4 text-white">
              <p className="font-brand text-lg font-bold">Menú</p>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1 hover:bg-white/10">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <a
                href={`tel:${phoneDisplay.replace(/\s/g, '')}`}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-pollon-red text-pollon-red">
                  <Phone className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold">{phoneDisplay}</p>
                  <p className="text-xs text-gray-500">Llámanos o escríbenos</p>
                </div>
              </a>

              <p className="mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Categorías</p>
              <nav className="space-y-0.5">
                {navMenu.map((item) => {
                  const active = isNavActive(item, location);
                  return (
                    <Link
                      key={item.categoryId || 'inicio'}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`font-brand block rounded-lg px-3 py-3 text-[15px] font-semibold ${
                        active ? 'bg-pollon-red text-white' : 'text-gray-800 hover:bg-red-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6 space-y-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => handleAccountClick('login')}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-semibold"
                >
                  <User className="h-5 w-5 text-pollon-red" />
                  {isAuthenticated && isCustomer ? 'Mi cuenta' : 'Iniciar sesión'}
                </button>
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => handleAccountClick('register')}
                    className="w-full rounded-xl bg-pollon-red py-3 text-sm font-bold text-white"
                  >
                    Registrarse
                  </button>
                )}
                <Link
                  to="/sucursal"
                  onClick={() => setMobileOpen(false)}
                  className="block text-center text-sm font-semibold text-pollon-red"
                >
                  Ver todas las sucursales
                </Link>
              </div>
            </div>

            <div className="border-t p-4">
              <button
                type="button"
                onClick={() => { onOpenCart(); setMobileOpen(false); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-pollon-red py-3.5 font-bold text-white"
              >
                <ShoppingCart className="h-5 w-5" />
                Mi pedido · {money(subtotal)}
                {itemCount > 0 && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-pollon-red">{itemCount}</span>
                )}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
