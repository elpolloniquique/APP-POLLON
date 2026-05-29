import { Link, useNavigate } from 'react-router-dom';
import {
  Flame, MapPin, Phone, Clock, Bike, ChevronRight, Plus, Star, Shield, ChefHat,
  MapPinned, ShoppingBag, CreditCard, MessageCircle, PackageSearch,
  CheckCircle2, Truck, UtensilsCrossed, Smartphone,
} from 'lucide-react';
import { ORDER_STATUS_STEPS, ORDER_STATUS_LABELS } from '../utils/constants';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { WhatsAppFab } from '../components/layout/WhatsAppFab';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useCart } from '../context/CartContext';
import { useBranch } from '../context/BranchContext';
import { useBranchMenu } from '../context/BranchMenuContext';
import { isBranchOpenNow } from '../services/branchService';
import { money } from '../utils/format';

const WHY_US = [
  { icon: ChefHat, title: 'Pollo fresco del día', desc: 'Marinado y cocinado al carbón cada día con receta peruana auténtica.' },
  { icon: Bike, title: 'Delivery rápido y seguro', desc: 'Llegamos caliente a tu puerta en Arica, Iquique y Alto Hospicio.' },
  { icon: Shield, title: 'Pago 100% seguro', desc: 'Solo efectivo al recibir o transferencia bancaria con comprobante.' },
  { icon: Star, title: 'Más de 10.000 clientes', desc: 'La pollería favorita del norte con ofertas familiares todos los días.' },
];

const TESTIMONIALS = [
  { name: 'María González', text: 'El mejor pollo a la brasa de Iquique, siempre fresco y crujiente. El delivery llegó súper rápido.', stars: 5 },
  { name: 'Carlos Ruiz', text: 'Las ofertas familiares son increíbles. Pedimos cada fin de semana y nunca defraudan.', stars: 5 },
  { name: 'Ana Torres', text: 'Excelente atención por WhatsApp. El combo chaufa es mi favorito, 100% recomendado.', stars: 5 },
];

function imgSrc(path) {
  if (!path) return '/img/todo el menu.png';
  return path.startsWith('/') ? path : `/${path}`;
}

export function Home() {
  const { setIsOpen, addItem } = useCart();
  const { branch, branches, setBranch } = useBranch();
  const navigate = useNavigate();
  const { categories, productsByCategory, products: menuProducts } = useBranchMenu();

  const promos = (() => {
    const featured = menuProducts.filter((p) => p.isPromotion || p.isFeatured);
    if (featured.length) return featured.slice(0, 4);
    const first = productsByCategory[categories[0]?.id] || [];
    return first.slice(0, 4);
  })();
  const bestsellers = menuProducts.slice(0, 6);
  const menuCircles = categories.slice(0, 8).map((c) => ({
    id: c.id,
    label: c.name,
    img: imgSrc(c.imageUrl || c.image),
  }));

  const quickAdd = (p, category) => {
    addItem({
      name: p.name,
      qty: 1,
      unitPrice: p.price,
      total: p.price,
      categoryId: category,
      available: true,
    });
    setIsOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader onOpenCart={() => setIsOpen(true)} />
      <CartDrawer />
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
            {promos.length ? promos.map((p, i) => (
              <article key={p.name + i} className="card-hover overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-100">
                <div className="relative aspect-[4/3]">
                  <img src={imgSrc(p.image)} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.src = '/img/todo el menu.png'; }} />
                  <span className="absolute left-3 top-3 rounded-full bg-pollon-red px-2.5 py-1 text-[10px] font-bold text-white">
                    Ahorra {15 + i * 5}%
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-bold uppercase tracking-wide text-pollon-black">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{p.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-2xl text-pollon-gold">{money(p.price)}</span>
                    <button
                      type="button"
                      onClick={() => quickAdd(p, p.categoryId)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-pollon-red text-white shadow-md hover:bg-pollon-red-dark"
                      aria-label="Agregar"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </article>
            )) : (
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
                to={`/tienda?cat=${c.id}`}
                className="group flex w-28 shrink-0 flex-col items-center gap-3"
              >
                <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-pollon-red/20 shadow-lg transition group-hover:border-pollon-red">
                  <img src={c.img} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.src = '/img/todo el menu.png'; }} />
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
            <h3 className="mb-4 border-b-2 border-pollon-red pb-2 font-display text-2xl text-pollon-black">
              MÁS VENDIDOS
            </h3>
            <ul className="space-y-4">
              {bestsellers.map((p, i) => (
                <li key={p.name + i} className="flex items-center gap-3">
                  <img
                    src={imgSrc(p.image)}
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
                    onClick={() => quickAdd(p, p.categoryId)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pollon-red text-white hover:bg-pollon-red-dark"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
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

      {/* Cómo pedir y seguir tu pedido */}
      <section className="relative overflow-hidden bg-pollon-red py-14 text-white md:py-16">
        <div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-pollon-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-black/20 blur-3xl" />

        <div className="relative mx-auto max-w-[1400px] px-4">
          <div className="mb-10 max-w-3xl">
            <span className="inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest">
              Guía rápida · 100% web
            </span>
            <h2 className="mt-3 font-display text-3xl leading-tight md:text-4xl lg:text-5xl">
              PIDE Y SIGUE TU PEDIDO <span className="text-pollon-gold">EN POCOS PASOS</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/85 md:text-base">
              Sin descargar apps. Elige sucursal, pide desde el menú y revisa el estado en tu cuenta.
            </p>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
            {/* Guía compacta */}
            <div className="lg:col-span-5 xl:col-span-5">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm md:p-6">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-pollon-gold">
                  <ShoppingBag className="h-4 w-4" /> Cómo pedir
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    { n: '01', icon: MapPinned, t: 'Sucursal', d: 'Elige Iquique, Alto Hospicio o Arica.' },
                    { n: '02', icon: ShoppingBag, t: 'Menú', d: 'Agrega platos al carrito.' },
                    { n: '03', icon: CreditCard, t: 'Datos y pago', d: 'Efectivo o transferencia.' },
                    { n: '04', icon: MessageCircle, t: 'WhatsApp', d: 'Confirmas con la sucursal.' },
                  ].map((s) => (
                    <div key={s.n} className="rounded-xl bg-black/20 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-pollon-gold">{s.n}</span>
                        <s.icon className="h-3.5 w-3.5 text-white/70" />
                        <p className="text-sm font-bold">{s.t}</p>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-white/75">{s.d}</p>
                    </div>
                  ))}
                </div>

                <h3 className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-pollon-gold">
                  <PackageSearch className="h-4 w-4" /> Cómo seguir tu pedido
                </h3>
                <ul className="mt-3 space-y-2">
                  {[
                    'Regístrate en «Iniciar sesión / Registrarse» (arriba en la web).',
                    'Entra a Mi cuenta → Mis pedidos.',
                    'Abre tu pedido y mira el estado actualizado en vivo.',
                  ].map((txt, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-white/85">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pollon-gold" />
                      {txt}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link to="/tienda" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-xs font-bold uppercase text-pollon-red shadow-md hover:bg-pollon-cream">
                    Pedir ahora <ChevronRight className="h-4 w-4" />
                  </Link>
                  <Link to="/cuenta" className="inline-flex items-center rounded-xl border border-white/50 px-5 py-2.5 text-xs font-bold uppercase hover:bg-white/10">
                    Mis pedidos
                  </Link>
                </div>
              </div>
            </div>

            {/* Panel visual: celular + contenido alrededor */}
            <div className="lg:col-span-7 xl:col-span-7">
              <div className="grid gap-4 sm:grid-cols-12 sm:items-stretch">
                {/* Timeline estados — izquierda del celular */}
                <div className="sm:col-span-4 order-2 sm:order-1">
                  <div className="h-full rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-pollon-gold">Estados del pedido</p>
                    <p className="mt-1 text-xs text-white/70">Lo que verás en seguimiento</p>
                    <ul className="mt-4 space-y-2.5">
                      {ORDER_STATUS_STEPS.map((st, i) => {
                        const meta = ORDER_STATUS_LABELS[st];
                        const active = st === 'preparando';
                        return (
                          <li key={st} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${active ? 'bg-white/15 font-bold' : ''}`}>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? 'bg-pollon-gold text-pollon-black' : 'bg-white/20'}`}>
                              {i + 1}
                            </span>
                            <span className="leading-tight">{meta?.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                {/* Celular */}
                <div className="flex justify-center sm:col-span-4 order-1 sm:order-2">
                  <div className="relative">
                    <div className="absolute -left-8 top-8 hidden rounded-xl border border-white/20 bg-white px-3 py-2 shadow-xl lg:block">
                      <p className="text-[10px] font-bold text-pollon-red">Sin app</p>
                      <p className="text-[9px] text-gray-600">Solo navegador</p>
                    </div>
                    <div className="w-[200px] rounded-[1.75rem] border-[3px] border-white/40 bg-pollon-black p-2.5 shadow-2xl sm:w-[220px]">
                      <div className="overflow-hidden rounded-[1.25rem] bg-white">
                        <div className="bg-pollon-red px-2 py-2 text-center text-[10px] font-bold text-white">EL POLLÓN</div>
                        <img src="/img/oferton familiar.png" alt="" className="aspect-square w-full object-cover" />
                        <div className="p-2.5">
                          <p className="text-[10px] font-bold text-gray-800">Combo Familiar</p>
                          <p className="font-display text-lg text-pollon-red">$23.500</p>
                          <div className="mt-1.5 rounded-md bg-pollon-red py-1.5 text-center text-[9px] font-bold text-white">AGREGAR AL CARRITO</div>
                        </div>
                        <div className="border-t bg-amber-50 px-2 py-2">
                          <p className="text-[8px] font-bold uppercase text-amber-800">Seguimiento activo</p>
                          <p className="text-[9px] font-semibold text-gray-700">En cocina · Pedido #004821</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute -right-6 bottom-16 hidden rounded-xl border border-white/20 bg-pollon-gold px-3 py-2 shadow-xl lg:block">
                      <p className="text-[10px] font-bold text-pollon-black">Tiempo real</p>
                      <p className="text-[9px] text-pollon-black/80">Se actualiza solo</p>
                    </div>
                  </div>
                </div>

                {/* Tarjetas derecha */}
                <div className="flex flex-col gap-3 sm:col-span-4 order-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-pollon-gold" />
                      <p className="text-sm font-bold">Pago seguro</p>
                    </div>
                    <p className="mt-2 text-xs text-white/80">Efectivo al recibir o transferencia con comprobante por WhatsApp.</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-pollon-gold" />
                      <p className="text-sm font-bold">Delivery y retiro</p>
                    </div>
                    <p className="mt-2 text-xs text-white/80">Pide a domicilio o retira en local según tu sucursal.</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-pollon-gold" />
                      <p className="text-sm font-bold">Tip rápido</p>
                    </div>
                    <p className="mt-2 text-xs text-white/80">En Chrome o Safari: menú ⋮ → «Agregar a pantalla de inicio».</p>
                  </div>
                </div>

                {/* Fila inferior — ancho completo */}
                <div className="grid gap-3 sm:col-span-12 sm:grid-cols-3 order-4">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <MapPin className="h-8 w-8 shrink-0 text-pollon-gold" />
                    <div>
                      <p className="text-xs font-bold">4 sucursales</p>
                      <p className="text-[11px] text-white/75">Iquique · Alto Hospicio · Arica</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <UtensilsCrossed className="h-8 w-8 shrink-0 text-pollon-gold" />
                    <div>
                      <p className="text-xs font-bold">Menú por sucursal</p>
                      <p className="text-[11px] text-white/75">Precios y platos según tu local</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <Clock className="h-8 w-8 shrink-0 text-pollon-gold" />
                    <div>
                      <p className="text-xs font-bold">Horario habitual</p>
                      <p className="text-[11px] text-white/75">Lun–Dom · 11:30 a 23:00</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
