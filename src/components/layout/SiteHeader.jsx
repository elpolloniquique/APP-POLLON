import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingCart, Phone, User, MapPin, Search, ChevronDown, Menu, X,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { isBranchOpenNow } from '../../services/branchService';
import { money } from '../../utils/format';
import { CATEGORY_ORDER, CATEGORY_META } from '../../utils/constants';
import { AuthModal } from '../auth/AuthModal';

function selectBranchWithCartConfirm(b, branch, setBranch, resetForBranch, items, cartBranchId, onDone) {
  if (!b || b.comingSoon) return;
  if (b.id === branch?.id) { onDone?.(); return; }
  if (items.length > 0 && cartBranchId && cartBranchId !== b.id) {
    if (!window.confirm('Al cambiar de sucursal se vaciará tu carrito actual. ¿Deseas continuar?')) return;
    resetForBranch(b.id);
  }
  setBranch(b);
  onDone?.();
}

const NAV_MENU = [
  { label: 'INICIO', path: '/', slug: null },
  ...CATEGORY_ORDER.map((slug) => ({
    label: CATEGORY_META[slug]?.title || slug,
    path: `/tienda?cat=${slug}`,
    slug,
  })),
];

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
  return params.get('cat') === item.slug;
}

function BranchDropdown({
  branch, branches, branchLabel, branchOpen, setBranchOpen,
  items, cartBranchId, setBranch, resetForBranch,
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
        onClick={() => setBranchOpen(!branchOpen)}
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
  const { isAuthenticated, isCustomer, isStaff, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState('login');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

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
    setSearchExpanded(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!searchExpanded) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSearchExpanded(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [searchExpanded]);

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

  const handleSearch = useCallback((e) => {
    e?.preventDefault();
    if (search.trim()) navigate(`/tienda?q=${encodeURIComponent(search.trim())}`);
    else navigate('/tienda');
    setMobileOpen(false);
    setSearchExpanded(false);
  }, [search, navigate]);

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
    `shrink-0 rounded-full font-extrabold uppercase tracking-wide ${
      isOpen ? 'bg-[#4ade80] text-black shadow-sm' : 'bg-white/20 text-white'
    } ${mobile ? 'px-2.5 py-1 text-[11px]' : 'px-5 py-1.5 text-sm'}`;

  const branchDropdownProps = {
    branch,
    branches,
    branchOpen,
    setBranchOpen,
    items,
    cartBranchId,
    setBranch,
    resetForBranch,
  };

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
      <header className="header-text-crisp sticky top-0 z-50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">

        {/* ═══════════════ MÓVIL: barra superior ═══════════════ */}
        <div className="bg-pollon-red text-white lg:hidden">
          <div className="flex items-center justify-between gap-1.5 px-3 py-2.5 text-xs leading-snug sm:text-sm">
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
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium">
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

        {/* ═══════════════ MÓVIL: barra búsqueda (negro + input blanco) ═══════════════ */}
        {showNav && (
          <form
            onSubmit={handleSearch}
            className="border-b border-white/5 bg-[#0a0a0a] px-3 py-2.5 lg:hidden"
          >
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full rounded-full border border-gray-200/90 bg-white py-3 pl-5 pr-12 text-base font-medium text-gray-900 shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pollon-red/40"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:text-pollon-red"
                aria-label="Buscar"
              >
                <Search className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </form>
        )}

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

        {/* ═══════════════ PC: navegación + búsqueda (negro profundo) ═══════════════ */}
        {showNav && (
          <nav className="hidden border-b border-white/[0.06] bg-[#0a0a0a] lg:block">
            <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide py-1 pr-2">
                {NAV_MENU.map((item) => {
                  const active = isNavActive(item, location);
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      className={`font-brand shrink-0 whitespace-nowrap px-4 py-3.5 text-base font-bold antialiased transition xl:px-5 xl:text-[17px] ${
                        active
                          ? 'rounded-md bg-zinc-800 text-white shadow-sm ring-1 ring-white/15'
                          : 'text-white hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              {/* Buscador colapsable: solo icono → expande al hacer clic */}
              <div className="relative shrink-0 py-2 pl-1">
                {searchExpanded && (
                  <button
                    type="button"
                    className="fixed inset-0 z-[45] cursor-default"
                    onClick={() => setSearchExpanded(false)}
                    aria-label="Cerrar búsqueda"
                  />
                )}
                <form
                  onSubmit={handleSearch}
                  className="relative z-[46] flex items-center justify-end"
                >
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      searchExpanded ? 'mr-2 w-[min(280px,calc(100vw-5rem))] opacity-100 xl:w-[320px]' : 'mr-0 w-0 opacity-0'
                    }`}
                  >
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar productos..."
                      tabIndex={searchExpanded ? 0 : -1}
                      className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-5 pr-4 text-base font-medium text-gray-900 shadow-xl placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pollon-red/50"
                    />
                  </div>
                  <button
                    type={searchExpanded ? 'button' : 'button'}
                    onClick={() => {
                      if (searchExpanded) setSearchExpanded(false);
                      else setSearchExpanded(true);
                    }}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                      searchExpanded
                        ? 'bg-white/15 text-white hover:bg-white/25'
                        : 'border border-white/30 bg-white/10 text-white hover:border-white/50 hover:bg-white/20'
                    }`}
                    aria-label={searchExpanded ? 'Cerrar buscador' : 'Abrir buscador'}
                    aria-expanded={searchExpanded}
                  >
                    {searchExpanded ? (
                      <X className="h-5 w-5" strokeWidth={2.5} />
                    ) : (
                      <Search className="h-5 w-5" strokeWidth={2.25} />
                    )}
                  </button>
                </form>
              </div>
            </div>
          </nav>
        )}
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
                {NAV_MENU.map((item) => {
                  const active = isNavActive(item, location);
                  return (
                    <Link
                      key={item.label}
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

export { NAV_MENU as NAV_LINKS };
