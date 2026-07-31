import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { ADMIN_NAV } from '../../utils/constants';
import {
  LogOut, Menu, X,
  LayoutDashboard, BookOpen, ShoppingBag, ChefHat, Users, Megaphone,
  Building2, Banknote, Package, BarChart3, Settings, Bike, SlidersHorizontal,
  DollarSign, Send, MapPin, FileBarChart,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';

const ICON_MAP = {
  LayoutDashboard, BookOpen, ShoppingBag, ChefHat, Users, Megaphone,
  Building2, Banknote, Package, BarChart3, Settings, Bike, SlidersHorizontal,
  DollarSign, Send, MapPin, FileBarChart,
};

function NavIcon({ name, className }) {
  const Comp = ICON_MAP[name];
  if (!Comp) return null;
  return <Comp className={className} strokeWidth={1.8} />;
}

export function AdminLayout() {
  const { profile, signOut, can, role } = useAuth();
  const { branchName, isBranchScoped, branchId } = useStaffBranch();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav = useMemo(() => ADMIN_NAV.filter((n) => can(n.perm)), [can, role]);

  const currentPageLabel = useMemo(() => {
    const match = nav.find((item) =>
      item.path === '/admin'
        ? location.pathname === '/admin'
        : location.pathname.startsWith(item.path),
    );
    return match?.label || 'Administración';
  }, [nav, location.pathname]);

  // Always close drawer on navigate
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Lock scroll when open + avisar a mapas (invalidateSize)
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    window.dispatchEvent(new CustomEvent('ep-admin-drawer', { detail: { open } }));
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const roleLabels = {
    super_admin: 'Super Admin',
    admin_sucursal: 'Admin sucursal',
    cajera: 'Cajera',
    cajero: 'Cajero',
    despachador: 'Despachador',
    cocina: 'Cocina',
    delivery: 'Repartidor',
  };
  const roleLabel = roleLabels[role] || role;

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await signOut();
    navigate('/admin/login');
  }, [signOut, navigate]);

  const mainNav = useMemo(() => nav.filter((n) => n.group !== 'delivery'), [nav]);
  const deliveryNav = useMemo(() => nav.filter((n) => n.group === 'delivery'), [nav]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      {/* ─── TOP BAR ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-gray-200/80 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,.04)] sm:px-5 sm:py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 active:scale-95"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Administración</p>
          <h1 className="truncate text-sm font-semibold tracking-tight text-gray-900 sm:text-base">{currentPageLabel}</h1>
        </div>
        {isBranchScoped && branchName && (
          <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600 sm:inline-block">
            {branchName}
          </span>
        )}
      </header>

      {/* ─── DRAWER BACKDROP ─────────────────────────────────── */}
      {/* z-[1200]: por encima de paneles Leaflet (~400–700) */}
      <div
        className={`fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[2px] transition-opacity duration-250 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* ─── DRAWER ──────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-[1210] flex w-72 flex-col bg-[#1a1a1a] text-white shadow-2xl transition-transform duration-250 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!open}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/img/logo pollon.png" alt="" className="h-10 w-10 rounded-full bg-white/10 object-contain" />
            <div>
              <p className="text-[15px] font-bold tracking-wide text-white">EL POLLÓN</p>
              <p className="text-[11px] font-medium tracking-wide text-white/40">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.12) transparent' }}>
          <div className="space-y-0.5">
            {mainNav.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === '/admin'}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium tracking-wide transition-all duration-150 ${
                    isActive
                      ? 'bg-white/[.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]'
                      : 'text-white/50 hover:bg-white/[.04] hover:text-white/80'
                  }`
                }
              >
                <NavIcon name={item.icon} className="h-[18px] w-[18px] flex-none opacity-70 group-hover:opacity-100" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          {deliveryNav.length > 0 && (
            <>
              <div className="mx-3 my-4 h-px bg-white/[.06]" />
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Delivery / GPS
              </p>
              <div className="space-y-0.5">
                {deliveryNav.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium tracking-wide transition-all duration-150 ${
                        isActive
                          ? 'bg-white/[.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]'
                          : 'text-white/50 hover:bg-white/[.04] hover:text-white/80'
                      }`
                    }
                  >
                    <NavIcon name={item.icon} className="h-[18px] w-[18px] flex-none opacity-70 group-hover:opacity-100" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[.06] px-5 py-4">
          <p className="truncate text-[11px] text-white/35">{profile?.email}</p>
          {isBranchScoped && branchId && (
            <p className="mt-0.5 truncate text-[11px] text-white/25">Local: {branchName}</p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-white/40 transition hover:bg-white/[.04] hover:text-white/70"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─── MAIN ────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {isBranchScoped && !branchId && (
          <div className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:mx-5 sm:mt-4 sm:text-sm">
            Tu cuenta no tiene sucursal asignada. Solo verás datos vacíos hasta que el super admin configure tu <code>branch_id</code>.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
