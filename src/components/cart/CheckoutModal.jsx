import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, CheckCircle, Bike, Loader2, Banknote, Landmark, CreditCard, Check, Clock } from 'lucide-react';
import { AddressAutocomplete } from './AddressAutocomplete';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { useCart } from '../../context/CartContext';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { money, formatDateTime, normalizeChilePhone, buildWhatsappMessage } from '../../utils/format';
import { ORDER_TYPE_LABELS } from '../../utils/constants';
import {
  getAvailableOrderTypes,
  getDefaultOrderType,
  validateOrderTypeChoice,
  getOrderTypeHint,
} from '../../utils/orderTypeConfig';
import {
  getAvailablePaymentMethods,
  getDefaultPaymentMethod,
  isPaymentMethodAllowed,
} from '../../utils/paymentMethods';
import * as orderService from '../../services/orderService';
import { quoteDelivery } from '../../services/pricingService';
import { haversineKm, formatDistance } from '../../utils/geo';
import { useToast } from '../../hooks/useToast';

const ORDER_TYPES = ['delivery', 'retiro', 'reserva'];

function OrderTypeHint({ hint }) {
  if (!hint) return null;
  const isWarning = hint.variant === 'warning';
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-xs leading-snug ${
        isWarning ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-blue-50 text-blue-900 ring-1 ring-blue-100'
      }`}
    >
      {hint.text}
    </p>
  );
}

const PAYMENT_ICONS = {
  efectivo: Banknote,
  transferencia: Landmark,
  tarjeta: CreditCard,
};

export function CheckoutModal() {
  const { items, subtotal, clearCart, checkoutOpen, setCheckoutOpen } = useCart();
  const { branch, whatsapp, branchOpen } = useBranch();
  const { profile, isCustomer } = useAuth();
  const { show, Toast } = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    addressLat: null,
    addressLng: null,
    orderType: 'delivery',
    payment: 'efectivo',
    comments: '',
  });
  const [deliveryQuote, setDeliveryQuote] = useState(null); // { fee, distanceKm, zone, outOfRange, loading }
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('form');
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const submitLock = useRef(false);

  const isDelivery = form.orderType === 'delivery';
  const availableOrderTypes = getAvailableOrderTypes(branch);
  const availablePaymentMethods = getAvailablePaymentMethods(branch);
  const orderTypeHint = getOrderTypeHint(branch, form.orderType, subtotal);
  const deliveryFee = isDelivery && deliveryQuote && !deliveryQuote.outOfRange && !deliveryQuote.loading
    ? (deliveryQuote.fee || 0)
    : 0;
  const orderTotal = subtotal + (isDelivery ? deliveryFee : 0);

  useEffect(() => {
    if (!checkoutOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [checkoutOpen]);

  useEffect(() => {
    if (!checkoutOpen) {
      setStep('form');
      setConfirmedOrder(null);
      submitLock.current = false;
      return;
    }
    if (!items.length && step === 'form') setCheckoutOpen(false);
  }, [checkoutOpen, items.length, step, setCheckoutOpen]);

  useEffect(() => {
    if (checkoutOpen && isCustomer && profile) {
      setForm((f) => ({
        ...f,
        name: f.name || profile.fullName || profile.nombre || '',
        phone: f.phone || profile.phone || '',
      }));
    }
  }, [checkoutOpen, isCustomer, profile]);

  useEffect(() => {
    if (!checkoutOpen || !branch) return;
    const types = getAvailableOrderTypes(branch);
    if (!types.length) return;
    setForm((f) => (types.includes(f.orderType) ? f : { ...f, orderType: getDefaultOrderType(branch) }));
  }, [checkoutOpen, branch]);

  useEffect(() => {
    if (!checkoutOpen || !branch) return;
    setForm((f) => (
      isPaymentMethodAllowed(branch, f.payment)
        ? f
        : { ...f, payment: getDefaultPaymentMethod(branch) }
    ));
  }, [checkoutOpen, branch]);

  // Cotiza delivery automático al confirmar dirección (coords)
  useEffect(() => {
    if (!checkoutOpen || form.orderType !== 'delivery') {
      setDeliveryQuote(null);
      return undefined;
    }
    const lat = form.addressLat;
    const lng = form.addressLng;
    if (lat == null || lng == null || branch?.lat == null || branch?.lng == null) {
      setDeliveryQuote(null);
      return undefined;
    }

    let cancelled = false;
    setDeliveryQuote((q) => ({ ...(q || {}), loading: true, fee: q?.fee ?? 0 }));

    (async () => {
      try {
        const km = haversineKm(branch.lat, branch.lng, lat, lng);
        if (km == null) {
          if (!cancelled) setDeliveryQuote({ fee: 0, distanceKm: null, outOfRange: true, loading: false });
          return;
        }
        const quote = await quoteDelivery(branch.id, km);
        if (cancelled) return;
        setDeliveryQuote({
          fee: Number(quote.fee) || 0,
          distanceKm: Number(quote.distance_km) || km,
          zone: quote.zone || null,
          outOfRange: !!quote.out_of_range,
          maxKm: quote.max_km,
          loading: false,
        });
      } catch {
        if (!cancelled) setDeliveryQuote({ fee: 0, distanceKm: null, outOfRange: true, loading: false, error: true });
      }
    })();

    return () => { cancelled = true; };
  }, [checkoutOpen, form.orderType, form.addressLat, form.addressLng, branch?.id, branch?.lat, branch?.lng]);

  if (!checkoutOpen) {
    return Toast;
  }

  if (!items.length && step !== 'success') {
    return Toast;
  }

  const closeModal = () => {
    setCheckoutOpen(false);
    setStep('form');
    setConfirmedOrder(null);
    setDeliveryQuote(null);
    submitLock.current = false;
  };

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const scrollToField = (e) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const validate = () => {
    if (!form.name.trim()) return 'Ingresa tu nombre';
    if (!normalizeChilePhone(form.phone)) return 'Ingresa un teléfono válido (ej. 9 2558 6256)';
    if (form.orderType === 'delivery') {
      if (!form.address.trim()) return 'Ingresa tu dirección de entrega';
      if (!form.addressLat || !form.addressLng) return 'Selecciona una dirección de la lista para calcular el delivery';
      if (branch?.lat == null || branch?.lng == null) return 'La sucursal no tiene ubicación GPS configurada';
      if (deliveryQuote?.loading) return 'Calculando costo de delivery…';
      if (deliveryQuote?.outOfRange) {
        const max = deliveryQuote.maxKm ? ` (máx. ${deliveryQuote.maxKm} km)` : '';
        return `Tu dirección está fuera de la zona de cobertura${max}`;
      }
      if (!deliveryQuote || !(deliveryQuote.fee > 0)) return 'No se pudo calcular el delivery. Revisa tu dirección';
    }
    if (!items.length) return 'Tu carrito está vacío';
    if (!branch) return 'Selecciona una sucursal';
    if (!branchOpen) return 'La sucursal está cerrada en este momento';
    const typeErr = validateOrderTypeChoice(branch, form.orderType, subtotal);
    if (typeErr) return typeErr;
    if (!isPaymentMethodAllowed(branch, form.payment)) {
      return 'Selecciona un método de pago válido para esta sucursal';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current || submitting) return;

    const err = validate();
    if (err) { show(err); return; }

    submitLock.current = true;
    setSubmitting(true);
    try {
      const order = {
        id: orderService.generateOrderId(),
        createdAt: new Date().toISOString(),
        customer: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.orderType === 'delivery' ? form.address.trim() : branch.address,
          addressLat: form.orderType === 'delivery' ? form.addressLat : (branch?.lat ?? null),
          addressLng: form.orderType === 'delivery' ? form.addressLng : (branch?.lng ?? null),
          comments: form.comments.trim(),
        },
        items: [...items],
        subtotal,
        deliveryFee: form.orderType === 'delivery' ? deliveryFee : 0,
        deliveryDistanceKm: form.orderType === 'delivery' ? (deliveryQuote?.distanceKm ?? null) : null,
        total: orderTotal,
        orderType: form.orderType,
        metodo_pago: form.payment,
        estado: 'pendiente',
        branchId: branch.id,
        customerId: isCustomer && profile?.id && !String(profile.id).startsWith('local-') ? profile.id : null,
      };

      const saved = await orderService.saveOrder(order);
      clearCart();
      setConfirmedOrder(saved);
      setStep('success');
    } catch (ex) {
      submitLock.current = false;
      show(ex.message || 'Error al guardar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    if (!confirmedOrder || !whatsapp) return;
    const msg = buildWhatsappMessage(confirmedOrder, branch);
    const phone = String(whatsapp).replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    const opened = window.open(url, '_blank');
    if (!opened) window.location.assign(url);
  };

  if (step === 'success' && confirmedOrder) {
    const code = confirmedOrder.ticketNumber || confirmedOrder.codigo_pedido;
    return (
      <>
        {Toast}
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-4"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="checkout-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="checkout-success-title"
          >
            <header className="checkout-modal__header">
              <button
                type="button"
                onClick={closeModal}
                className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-col items-center pt-2 text-center">
                <CheckCircle className="h-16 w-16 text-green-600" strokeWidth={1.5} />
                <h2 id="checkout-success-title" className="mt-3 font-display text-2xl tracking-wide text-pollon-black sm:text-3xl">
                  ¡Pedido recibido!
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Tu pedido fue registrado correctamente y ya está visible en la sucursal.
                </p>
              </div>
            </header>

            <div className="checkout-modal__body admin-scroll-panel">
              <div className="rounded-2xl border border-green-200 bg-green-50/80 p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-green-800">Código de seguimiento</p>
                <p className="mt-2 font-display text-4xl tracking-wider text-pollon-black">#{code}</p>
                <p className="mt-3 text-xs text-gray-500 break-all">ID: {confirmedOrder.id}</p>
              </div>

              <div className="rounded-xl bg-pollon-cream/80 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total pagado</span>
                  <span className="font-bold text-pollon-red">{money(confirmedOrder.total)}</span>
                </div>
                <div className="mt-1 flex justify-between text-gray-600">
                  <span>Fecha</span>
                  <span>{formatDateTime(confirmedOrder.createdAt)}</span>
                </div>
                <div className="mt-1 flex justify-between text-gray-600">
                  <span>Sucursal</span>
                  <span className="text-right">{branch?.name}</span>
                </div>
              </div>

              <p className="text-center text-xs text-gray-500">
                Guarda tu código #{code} para consultar el estado de tu pedido en cualquier momento.
              </p>
            </div>

            <footer className="checkout-modal__footer space-y-3">
              <button
                type="button"
                onClick={handleWhatsApp}
                className="checkout-wa-btn"
              >
                <span className="checkout-wa-btn__icon-wrap" aria-hidden>
                  <WhatsAppIcon className="checkout-wa-btn__icon" />
                </span>
                <span className="checkout-wa-btn__copy">
                  <span className="checkout-wa-btn__title">
                    Enviar comprobante de mi pedido por WhatsApp
                  </span>
                  <span className="checkout-wa-btn__hint">
                    Se abre WhatsApp con el detalle completo listo para enviar a El Pollón.
                  </span>
                </span>
              </button>
              {confirmedOrder.id && (
                <Link
                  to={`/cuenta/seguimiento/${confirmedOrder.id}`}
                  onClick={closeModal}
                  className="block w-full rounded-xl border-2 border-pollon-red py-3 text-center text-sm font-bold uppercase tracking-wide text-pollon-red transition hover:bg-red-50"
                >
                  Seguir mi pedido
                </Link>
              )}
              <button
                type="button"
                onClick={closeModal}
                className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
              >
                Seguir comprando
              </button>
            </footer>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {Toast}
      <div
        className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-4"
        onClick={closeModal}
        role="presentation"
      >
        <div
          className="checkout-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="checkout-modal-title"
        >
          <header className="checkout-modal__header">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="checkout-modal-title" className="font-display text-2xl tracking-wide text-pollon-black sm:text-3xl">
              CONFIRMAR PEDIDO
            </h2>
            <p className="mt-1 text-sm text-gray-500">Sucursal: {branch?.name}</p>
          </header>

          <form onSubmit={handleSubmit} className="checkout-modal__form">
            <div className="checkout-modal__body admin-scroll-panel">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Tipo de pedido</label>
                {availableOrderTypes.length ? (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ORDER_TYPES.filter((t) => availableOrderTypes.includes(t)).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => update('orderType', t)}
                          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                            form.orderType === t ? 'bg-pollon-red text-white shadow-sm' : 'bg-gray-100 text-pollon-black hover:bg-gray-200'
                          }`}
                        >
                          {ORDER_TYPE_LABELS[t] || t}
                        </button>
                      ))}
                    </div>
                    <OrderTypeHint hint={orderTypeHint} />
                  </>
                ) : (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    Esta sucursal no tiene tipos de pedido habilitados. Contacta al local.
                  </p>
                )}
              </div>

              <input
                required
                placeholder="Nombre completo"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                onFocus={scrollToField}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
              />
              <input
                required
                placeholder="Teléfono"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                onFocus={scrollToField}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
              />

              {form.orderType === 'delivery' && (
                <AddressAutocomplete
                  value={form.address}
                  required
                  cityBias={branch?.city || 'Iquique'}
                  biasLat={branch?.lat}
                  biasLng={branch?.lng}
                  onChange={(label, geo) => {
                    setForm((f) => ({
                      ...f,
                      address: label,
                      addressLat: geo?.lat ?? null,
                      addressLng: geo?.lng ?? null,
                    }));
                  }}
                  onSelect={(geo) => {
                    if (geo) {
                      setForm((f) => ({
                        ...f,
                        address: geo.shortLabel,
                        addressLat: geo.lat,
                        addressLng: geo.lng,
                      }));
                    }
                  }}
                />
              )}

              <div>
                <label htmlFor="checkout-comments" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Comentarios <span className="font-normal normal-case text-gray-400">(opcional)</span>
                </label>
                <input
                  id="checkout-comments"
                  type="text"
                  placeholder="Ej: pollo trozado en 8 piezas, más ají"
                  value={form.comments}
                  onChange={(e) => update('comments', e.target.value)}
                  onFocus={scrollToField}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Método de pago
                </label>
                <p className="mb-2.5 text-xs text-gray-500">Selecciona cómo pagarás tu pedido</p>
                <div className={`checkout-pay-grid ${
                  availablePaymentMethods.length === 1 ? 'is-one' : availablePaymentMethods.length === 2 ? 'is-two' : ''
                }`}>
                  {availablePaymentMethods.map((p) => {
                    const selected = form.payment === p.id;
                    const Icon = PAYMENT_ICONS[p.id] || Banknote;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => update('payment', p.id)}
                        aria-pressed={selected}
                        className={`checkout-pay-card checkout-pay-card--${p.tone} ${selected ? 'is-selected' : ''}`}
                      >
                        <span className={`checkout-pay-card__icon checkout-pay-card__icon--${p.tone}`} aria-hidden>
                          <Icon size={22} strokeWidth={2.05} />
                        </span>
                        <span className="checkout-pay-card__label">{p.label}</span>
                        <span className={`checkout-pay-card__mark ${selected ? 'is-on' : ''}`} aria-hidden>
                          {selected ? <Check size={11} strokeWidth={3.2} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="checkout-pay-notice">
                  <Clock className="checkout-pay-notice__icon" aria-hidden />
                  <p className="checkout-pay-notice__text">
                    <strong>Importante:</strong> Todos los métodos de pago son al momento de recibir el pedido.
                  </p>
                </div>
              </div>
            </div>

            <footer className="checkout-modal__footer">
              <div className="mb-4 space-y-2 rounded-xl bg-pollon-cream/80 px-4 py-3">
                <div className="flex justify-between text-sm text-gray-700">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                {isDelivery && (
                  <div className="checkout-delivery-notice">
                    <div className="checkout-delivery-notice__head">
                      <Bike className="checkout-delivery-notice__icon" aria-hidden />
                      <p className="checkout-delivery-notice__title">Costo de delivery</p>
                    </div>
                    {!form.addressLat && (
                      <p className="checkout-delivery-notice__body">
                        Selecciona tu dirección exacta de la lista para calcular el delivery automáticamente.
                      </p>
                    )}
                    {form.addressLat && deliveryQuote?.loading && (
                      <p className="flex items-center gap-2 text-sm text-gray-600">
                        <Loader2 className="h-4 w-4 animate-spin" /> Calculando distancia…
                      </p>
                    )}
                    {form.addressLat && deliveryQuote && !deliveryQuote.loading && deliveryQuote.outOfRange && (
                      <p className="text-sm font-semibold text-red-600">
                        Fuera de cobertura{deliveryQuote.maxKm ? ` (máx. ${deliveryQuote.maxKm} km)` : ''}.
                        {deliveryQuote.distanceKm != null && ` Estás a ${formatDistance(deliveryQuote.distanceKm)}.`}
                      </p>
                    )}
                    {form.addressLat && deliveryQuote && !deliveryQuote.loading && !deliveryQuote.outOfRange && deliveryFee > 0 && (
                      <>
                        <p className="checkout-delivery-notice__range" style={deliveryQuote.zone?.color ? { color: deliveryQuote.zone.color } : undefined}>
                          {money(deliveryFee)}
                        </p>
                        <p className="checkout-delivery-notice__body">
                          {deliveryQuote.zone?.name || 'Zona'}
                          {deliveryQuote.distanceKm != null ? ` · ${formatDistance(deliveryQuote.distanceKm)} desde la sucursal` : ''}
                        </p>
                      </>
                    )}
                  </div>
                )}
                <div className="flex justify-between border-t border-black/5 pt-2 text-lg font-bold">
                  <span>Total{isDelivery && deliveryFee > 0 ? ' a pagar' : ''}</span>
                  <span className="text-pollon-red">{money(orderTotal)}</span>
                </div>
                {isDelivery && deliveryFee > 0 && (
                  <p className="text-[11px] leading-snug text-gray-500">
                    Incluye productos ({money(subtotal)}) + delivery ({money(deliveryFee)}).
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={
                  submitting
                  || !availableOrderTypes.length
                  || (isDelivery && (!!deliveryQuote?.loading || !!deliveryQuote?.outOfRange || !(deliveryFee > 0) || !form.addressLat))
                }
                className="w-full rounded-xl bg-pollon-red py-4 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-pollon-red-dark disabled:opacity-50"
              >
                {submitting ? 'Registrando pedido…' : 'Confirmar pedido'}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </>
  );
}
