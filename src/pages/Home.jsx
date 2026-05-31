import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Flame, MapPin, Phone, Clock, Bike, ChevronRight, Plus, Star, Shield, ChefHat,
  MapPinned, ShoppingBag, CreditCard, MessageCircle, PackageSearch,
  CheckCircle2, Truck, Radio, LogIn, ShoppingCart,
} from 'lucide-react';
import { ORDER_STATUS_STEPS, ORDER_STATUS_LABELS } from '../utils/constants';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { WhatsAppFab } from '../components/layout/WhatsAppFab';
import { CartDrawer } from '../components/cart/CartDrawer';
import { CheckoutModal } from '../components/cart/CheckoutModal';
import { ProductModal } from '../components/product/ProductModal';
import { useCart } from '../context/CartContext';
import { useBranch } from '../context/BranchContext';
import { useBranchMenu } from '../context/BranchMenuContext';
import { isBranchOpenNow } from '../services/branchService';
import { money, resolveMediaUrl, storeCategoryUrl, resolveProductCategoryId } from '../utils/format';
import { useBestsellers, BESTSELLERS_VISIBLE } from '../hooks/useBestsellers';
import { AdminScrollPanel } from '../components/admin/AdminScrollPanel';

const WHY_US = [
  { icon: ChefHat, title: 'Pollo fresco del día', desc: 'Marinado y cocinado al carbón cada día con receta peruana auténtica.' },
  { icon: Bike, title: 'Delivery rápido y seguro', desc: 'Llegamos caliente a tu puerta en Arica, Iquique y Alto Hospicio.' },
  { icon: Shield, title: 'Pago 100% seguro', desc: 'Solo efectivo al recibir o transferencia bancaria con comprobante.' },
  { icon: Star, title: 'Más de 10.000 clientes', desc: 'La pollería favorita del norte con ofertas familiares todos los días.' },
];

const HOME_ORDER_STEPS = [
  { n: 1, icon: MapPinned, title: 'Elige sucursal', desc: 'Selecciona tu local en el menú superior.' },
  { n: 2, icon: ShoppingBag, title: 'Arma tu pedido', desc: 'Personaliza platos y agrégalos al carrito.' },
  { n: 3, icon: CreditCard, title: 'Confirma y paga', desc: 'Completa tus datos: efectivo o transferencia.' },
  { n: 4, icon: MessageCircle, title: 'Recibe tu código', desc: 'Aparece al confirmar; envía comprobante por WhatsApp si quieres.' },
];

const HOME_TRACK_STEPS = [
  { n: 1, icon: CheckCircle2, title: '¿Confirmado?', desc: 'Al pulsar «Confirmar pedido» ves pantalla verde con tu código único.' },
  { n: 2, icon: LogIn, title: 'Inicia sesión', desc: 'Regístrate o entra desde el header para ver tu historial.' },
  { n: 3, icon: Radio, title: 'Seguimiento en vivo', desc: 'Mi cuenta → Mis pedidos → abre el pedido; el estado cambia solo.' },
];

const TESTIMONIALS = [
  { name: 'María González', text: 'El mejor pollo a la brasa de Iquique, siempre fresco y crujiente. El delivery llegó súper rápido.', stars: 5 },
  { name: 'Carlos Ruiz', text: 'Las ofertas familiares son increíbles. Pedimos cada fin de semana y nunca defraudan.', stars: 5 },
  { name: 'Ana Torres', text: 'Excelente atención por WhatsApp. El combo chaufa es mi favorito, 100% recomendado.', stars: 5 },
];

function imgSrc(path) {
  return resolveMediaUrl(path);
}

/** Imagen para círculos 「Explora nuestro menú」: foto de categoría (admin) o primer plato como respaldo. */
function categoryExploreImage(category, productsByCategory) {
  const adminImage = category.imageUrl || category.image;
  if (adminImage) return resolveMediaUrl(adminImage);

  const products = [...(productsByCategory[category.id] || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const coverProduct = products.find((p) => p.imageUrl || p.image) || products[0];
  const productImage = coverProduct?.imageUrl || coverProduct?.image;
  if (productImage) return resolveMediaUrl(productImage);
  return '/img/todo el menu.png';
}

export function Home() {
  const { setIsOpen } = useCart();
  const { branch, branches, setBranch } = useBranch();
  const navigate = useNavigate();
  const { categories, productsByCategory, products: menuProducts } = useBranchMenu();
  const { bestsellers } = useBestsellers(branch?.id, menuProducts);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return undefined;
    const id = location.hash.replace('#', '');
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const promos = (() => {
    const featured = menuProducts.filter((p) => p.isPromotion || p.isFeatured);
    const list = featured.length
      ? featured.slice(0, 4)
      : (productsByCategory[categories[0]?.id] || []).slice(0, 4);
    return list.map((p) => ({
      ...p,
      categoryId: resolveProductCategoryId(p, productsByCategory, categories),
    }));
  })();
  const menuCircles = categories.slice(0, 8).map((c) => ({
    id: c.id,
    label: c.name,
    img: categoryExploreImage(c, productsByCategory),
  }));

  const openProductModal = (p) => {
    setSelectedProduct({ product: p, categoryId: p.categoryId });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader onOpenCart={() => setIsOpen(true)} />
      <CartDrawer />
      <CheckoutModal />
      <WhatsAppFab />

      {/* HERO */}
      <section className="relative min-h-[520px] overflow-hidden md:min-h-[580px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/img/oferton%20familiar.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/30" />
        <div className="relative mx-auto flex max-w-[1400px] flex-col justify-center px-4 py-16 md:py-24">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded border border-pollon-red/50 bg-pollon-red/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-sm">
            <Flame className="h-4 w-4 text-pollon-orange" />
            Pollo a la brasa premium
          </span>
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] text-white md:text-7xl lg:text-8xl">
            EL SABOR QUE<br /><span className="text-pollon-gold">TE ENCANTA</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85 md:text-lg">
            Pollo a la brasa peruano, delivery y retiro en múltiples sucursales del norte de Chile.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/tienda"
              className="inline-flex items-center gap-2 rounded-lg bg-pollon-red px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-pollon-red-dark"
            >
              Pedir ahora <ChevronRight className="h-5 w-5" />
            </Link>
            <Link
              to="/tienda"
              className="inline-flex items-center rounded-lg border-2 border-white px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white hover:text-pollon-black"
            >
              Ver menú
            </Link>
            <Link
              to="/sucursal"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-white/60 px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:border-white"
            >
              <MapPin className="h-4 w-4" /> Elegir sucursal
            </Link>
          </div>
        </div>
      </section>

      {/* Barra de confianza bajo hero */}
      <div className="border-b border-gray-200 bg-white py-4 shadow-sm">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-6 px-4 text-sm font-medium text-gray-700 md:gap-12">
          <span className="flex items-center gap-2"><Bike className="h-5 w-5 text-pollon-red" /> Delivery rápido</span>
          <span className="flex items-center gap-2"><Shield className="h-5 w-5 text-pollon-red" /> Pago 100% seguro</span>
          <span className="flex items-center gap-2"><ChefHat className="h-5 w-5 text-pollon-red" /> Pollo fresco del día</span>
          <span className="flex items-center gap-2"><MapPin className="h-5 w-5 text-pollon-red" /> Atención multi-sucursal</span>
        </div>
      </div>

      {/* SUCURSALES */}
      <section className="bg-pollon-cream py-14">
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-4xl text-pollon-black md:text-5xl">
                ELIGE TU <span className="text-pollon-red">SUCURSAL</span>
              </h2>
              <p className="mt-1 text-gray-600">Selecciona la sucursal más cercana para ver menú, horarios y delivery</p>
            </div>
            <Link
              to="/sucursal"
              className="rounded-lg border-2 border-pollon-red px-6 py-2.5 text-sm font-bold uppercase text-pollon-red transition hover:bg-pollon-red hover:text-white"
            >
              Ver todas las sucursales
            </Link>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {branches.map((b) => (
              <article
                key={b.id}
                className="card-hover w-[300px] shrink-0 snap-start rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-tight text-pollon-black">{b.name}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    b.comingSoon ? 'bg-orange-100 text-orange-700' : isBranchOpenNow(b) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {b.comingSoon ? 'Próximamente' : isBranchOpenNow(b) ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-gray-600">
                  <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pollon-red" />{b.address}</li>
                  <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-pollon-red" />{b.phone}</li>
                  <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 shrink-0 text-pollon-red" />{b.schedule}</li>
                  <li className="flex items-center gap-2"><Bike className="h-3.5 w-3.5 shrink-0 text-pollon-red" />Delivery {money(b.deliveryCost)} · {b.deliveryEta}</li>
                  <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pollon-red" />Zona: {b.deliveryZones}</li>
                </ul>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={b.comingSoon}
                    onClick={() => { if (!b.comingSoon) { setBranch(b); navigate('/tienda'); } }}
                    className="flex-1 rounded-lg bg-pollon-red py-2 text-xs font-bold uppercase text-white disabled:opacity-40"
                  >
                    Pedir ahora
                  </button>
                  <Link
                    to="/sucursal"
                    className="flex-1 rounded-lg border border-pollon-red py-2 text-center text-xs font-bold uppercase text-pollon-red"
                  >
                    Ver ubicación
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PROMOCIONES DESTACADAS */}
      <section className="bg-pollon-cream py-14">
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-4xl text-pollon-black md:text-5xl">
              PROMOCIONES <span className="text-pollon-red">DESTACADAS</span>
            </h2>
            <Link to="/tienda" className="text-sm font-bold text-pollon-red hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {promos.length ? promos.map((p, i) => {
              const categoryId = p.categoryId || resolveProductCategoryId(p, productsByCategory, categories);
              const categoryName = categories.find((c) => c.id === categoryId)?.name;
              return (
              <article key={p.id || p.name + i} className="card-hover overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-100">
                <div className="relative aspect-[4/3]">
                  <img src={imgSrc(p.image || p.imageUrl)} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.src = '/img/todo el menu.png'; }} />
                  <span className="absolute left-3 top-3 rounded-full bg-pollon-red px-2.5 py-1 text-[10px] font-bold text-white">
                    Ahorra {15 + i * 5}%
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-bold uppercase tracking-wide text-pollon-black">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{p.description}</p>
                  {categoryName && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-pollon-red/80">
                      {categoryName}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-display text-2xl text-pollon-gold">{money(p.price)}</span>
                    <Link
                      to={storeCategoryUrl(categoryId, branch?.id)}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-pollon-red px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-pollon-red-dark"
                      aria-label={categoryName ? `Ver más en ${categoryName}` : 'Ver más en el menú'}
                    >
                      Ver más
                    </Link>
                  </div>
                </div>
              </article>
            );}) : (
              <p className="col-span-full py-8 text-center text-gray-500">
                {branch ? 'Sin promociones cargadas. Configúralas en el panel admin.' : 'Selecciona una sucursal para ver promociones.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* EXPLORA MENÚ */}
      <section className="py-14">
        <div className="mx-auto max-w-[1400px] px-4">
          <h2 className="mb-8 text-center font-display text-4xl text-pollon-black md:text-5xl">
            EXPLORA NUESTRO <span className="text-pollon-red">MENÚ</span>
          </h2>
          <div className="flex justify-center gap-6 overflow-x-auto pb-4 scrollbar-hide">
            {menuCircles.length ? menuCircles.map((c) => (
              <Link
                key={c.id}
                to={storeCategoryUrl(c.id, branch?.id)}
                className="group flex w-28 shrink-0 flex-col items-center gap-3"
              >
                <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-pollon-red/20 shadow-lg transition group-hover:border-pollon-red">
                  <img src={c.img} alt={c.label} className="h-full w-full object-cover" onError={(e) => { e.target.src = '/img/todo el menu.png'; }} />
                </div>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-gray-700">{c.label}</span>
              </Link>
            )) : (
              <p className="text-center text-gray-500">
                {branch ? 'Cargando categorías…' : (
                  <>Elige tu <Link to="/sucursal" className="font-bold text-pollon-red underline">sucursal</Link> para ver el menú</>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* TESTIMONIOS — sección destacada */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-[1400px] px-4">
          <h2 className="mb-10 text-center font-display text-4xl text-pollon-black md:text-5xl">
            LO QUE DICEN <span className="text-pollon-red">NUESTROS CLIENTES</span>
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <article key={t.name} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pollon-red text-lg font-bold text-white">{t.name[0]}</div>
                  <div>
                    <p className="font-bold">{t.name}</p>
                    <div className="flex gap-0.5">
                      {Array.from({ length: t.stars }).map((_, j) => (
                        <Star key={j} className="h-3.5 w-3.5 fill-pollon-gold text-pollon-gold" />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm italic text-gray-600">&ldquo;{t.text}&rdquo;</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3 COLUMNAS */}
      <section className="bg-pollon-cream py-14">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 lg:grid-cols-3">
          {/* Más vendidos */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-1 border-b-2 border-pollon-red pb-2 font-display text-2xl text-pollon-black">
              MÁS VENDIDOS
            </h3>
            <p className="mb-4 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Actualizado según ventas de la semana
            </p>
            <AdminScrollPanel maxRows={BESTSELLERS_VISIBLE} variant="card" className="home-bestsellers-scroll rounded-xl">
              <ul className="space-y-4 pr-1">
                {bestsellers.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <img
                      src={imgSrc(p.image || p.imageUrl)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      onError={(e) => { e.target.src = '/img/todo el menu.png'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="truncate text-xs text-gray-500">{p.description?.slice(0, 40)}</p>
                      <p className="font-bold text-pollon-red">{money(p.price)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openProductModal(p)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pollon-red text-white hover:bg-pollon-red-dark"
                      aria-label={`Agregar ${p.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {!bestsellers.length && (
                  <li className="py-6 text-center text-sm text-gray-500">Sin datos de ventas aún</li>
                )}
              </ul>
            </AdminScrollPanel>
            {bestsellers.length > BESTSELLERS_VISIBLE && (
              <p className="mt-2 text-center text-[10px] font-medium text-gray-400">
                Desplaza para ver más platos ↓
              </p>
            )}
            <Link to="/tienda" className="mt-4 block text-center text-sm font-semibold text-pollon-red hover:underline">
              Ver menú completo →
            </Link>
          </div>

          {/* Por qué elegirnos */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 border-b-2 border-pollon-red pb-2 font-display text-2xl text-pollon-black">
              POR QUÉ ELEGIRNOS
            </h3>
            <ul className="space-y-5">
              {WHY_US.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-pollon-red">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-pollon-black">{item.title}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Pagos aceptados */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 border-b-2 border-pollon-red pb-2 font-display text-2xl text-pollon-black">
              MÉTODOS DE PAGO
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4">
                <span className="text-2xl">💵</span>
                <div>
                  <p className="font-bold text-green-900">Efectivo</p>
                  <p className="text-sm text-green-700">Paga al recibir tu pedido en delivery o retiro en local.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4">
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="font-bold text-blue-900">Transferencia</p>
                  <p className="text-sm text-blue-700">Transfiere y envía comprobante por WhatsApp para confirmar.</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">No aceptamos tarjetas ni pago online.</p>
          </div>
        </div>
      </section>

      {/* Guía: pedir y seguimiento en tiempo real */}
      <section id="guia-pedido" className="home-order-guide relative scroll-mt-28 overflow-hidden bg-pollon-red py-10 text-white md:scroll-mt-32 md:py-12">
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-pollon-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-56 w-56 rounded-full bg-black/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4">
          <header className="home-order-guide__header mb-7 text-center lg:mb-8 lg:text-left">
            <span className="home-order-guide__badge">Guía rápida · 100% web</span>
            <h2 className="home-order-guide__title mt-2 font-display">
              PIDE Y SIGUE TU PEDIDO <span className="text-pollon-gold">EN POCOS PASOS</span>
            </h2>
            <p className="home-order-guide__subtitle mx-auto mt-2 max-w-xl lg:mx-0">
              Sin descargar apps. Todo desde el navegador, claro y al instante.
            </p>
          </header>

          <div className="home-order-guide__layout">
            {/* Cómo pedir */}
            <article className="home-order-guide__card">
              <h3 className="home-order-guide__card-title">
                <ShoppingBag className="h-5 w-5 shrink-0 text-pollon-gold" aria-hidden />
                Cómo hacer tu pedido
              </h3>
              <ol className="home-order-guide__steps home-order-guide__steps--grid mt-4">
                {HOME_ORDER_STEPS.map((s) => (
                  <li key={s.n} className="home-order-guide__step home-order-guide__step--compact">
                    <span className="home-order-guide__step-num">{s.n}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <s.icon className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
                        <p className="home-order-guide__step-title">{s.title}</p>
                      </div>
                      <p className="home-order-guide__step-desc">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/tienda" className="home-order-guide__cta home-order-guide__cta--primary mt-4">
                Pedir ahora <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>

            {/* Confirmación y seguimiento */}
            <article className="home-order-guide__card">
              <h3 className="home-order-guide__card-title">
                <PackageSearch className="h-5 w-5 shrink-0 text-pollon-gold" aria-hidden />
                Confirmación y seguimiento
              </h3>
              <p className="home-order-guide__card-lead mt-2">
                Confirmado al instante. Cada cambio se ve en vivo en tu cuenta.
              </p>
              <ol className="home-order-guide__steps mt-3">
                {HOME_TRACK_STEPS.map((s) => (
                  <li key={s.n} className="home-order-guide__step home-order-guide__step--compact">
                    <span className="home-order-guide__step-num home-order-guide__step-num--gold">{s.n}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <s.icon className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
                        <p className="home-order-guide__step-title">{s.title}</p>
                      </div>
                      <p className="home-order-guide__step-desc">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/cuenta" className="home-order-guide__cta home-order-guide__cta--outline mt-4">
                Ver mis pedidos
              </Link>
            </article>

            {/* Showcase: carrito + estados + confirmación */}
            <div className="home-order-guide__showcase">
              <div className="home-order-guide__showcase-col">
                <div className="home-order-guide__showcase-head">
                  <span className="home-order-guide__showcase-tag">Paso 2 · Menú</span>
                  <h4 className="home-order-guide__showcase-title">Agrega al carrito</h4>
                  <p className="home-order-guide__showcase-desc">
                    Elige un plato, personaliza opciones y pulsa «Agregar al carrito». El ícono del carrito muestra tus items.
                  </p>
                </div>
                <div className="home-order-guide__phone">
                  <div className="home-order-guide__phone-screen">
                    <div className="home-order-guide__phone-bar">EL POLLÓN · TIENDA</div>
                    <div className="home-order-guide__phone-product">
                      <div className="home-order-guide__phone-img" aria-hidden />
                      <p className="home-order-guide__phone-name">Combo Familiar</p>
                      <p className="home-order-guide__phone-price">$23.500</p>
                    </div>
                    <div className="home-order-guide__phone-action">
                      <p className="home-order-guide__phone-hint">Toca el plato → personaliza</p>
                      <span className="home-order-guide__phone-btn">
                        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                        Agregar al carrito
                      </span>
                    </div>
                    <div className="home-order-guide__phone-footer">
                      <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                      Carrito · 2 items
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-order-guide__showcase-col home-order-guide__showcase-col--status">
                <p className="home-order-guide__panel-label">Estados del pedido</p>
                <ul className="home-order-guide__status-list">
                  {ORDER_STATUS_STEPS.map((st, i) => {
                    const meta = ORDER_STATUS_LABELS[st];
                    const active = st === 'preparando';
                    return (
                      <li key={st} className={`home-order-guide__status-item${active ? ' is-active' : ''}`}>
                        <span className="home-order-guide__status-dot">{i + 1}</span>
                        <span>{meta?.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="home-order-guide__showcase-col">
                <div className="home-order-guide__showcase-head">
                  <span className="home-order-guide__showcase-tag">Paso 4 · Listo</span>
                  <h4 className="home-order-guide__showcase-title">Código y seguimiento</h4>
                  <p className="home-order-guide__showcase-desc">
                    Tras confirmar ves tu código. En Mi cuenta sigues cada estado en tiempo real.
                  </p>
                </div>
                <div className="home-order-guide__phone">
                  <div className="home-order-guide__phone-screen">
                    <div className="home-order-guide__phone-bar">EL POLLÓN</div>
                    <div className="home-order-guide__phone-confirm">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" strokeWidth={1.75} aria-hidden />
                      <p className="mt-1.5 text-sm font-bold text-gray-800">¡Pedido confirmado!</p>
                      <p className="home-order-guide__phone-code">#000142</p>
                      <p className="mt-0.5 text-xs text-gray-600">Tu código de seguimiento</p>
                    </div>
                    <div className="home-order-guide__phone-track">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">En vivo</p>
                      <p className="text-sm font-semibold text-gray-800">En cocina</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <ul className="home-order-guide__features-bar">
              {[
                { icon: Shield, t: 'Pago seguro', d: 'Efectivo o transferencia' },
                { icon: Truck, t: 'Delivery o retiro', d: 'Según tu sucursal' },
                { icon: MapPin, t: 'Multi-sucursal', d: 'Menú y precios por local' },
              ].map(({ icon: Icon, t, d }) => (
                <li key={t} className="home-order-guide__feature">
                  <Icon className="h-5 w-5 shrink-0 text-pollon-gold" aria-hidden />
                  <div>
                    <p className="home-order-guide__feature-title">{t}</p>
                    <p className="home-order-guide__feature-desc">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {selectedProduct && (
        <ProductModal
          product={{ ...selectedProduct.product, image: selectedProduct.product.image || selectedProduct.product.imageUrl }}
          category={selectedProduct.categoryId}
          categoryName={categories.find((c) => c.id === selectedProduct.categoryId)?.name}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <SiteFooter />
    </div>
  );
}
