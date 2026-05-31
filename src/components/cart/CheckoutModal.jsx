import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, CheckCircle, MessageCircle } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { money, buildWhatsappMessage, formatDateTime } from '../../utils/format';
import { PAYMENT_METHODS, TRANSFER_BANK_INFO, ORDER_TYPE_LABELS } from '../../utils/constants';
import * as orderService from '../../services/orderService';
import { useToast } from '../../hooks/useToast';

const ORDER_TYPES = ['delivery', 'retiro', 'reserva'];

export function CheckoutModal() {
  const { items, subtotal, deliveryFee, clearCart, checkoutOpen, setCheckoutOpen } = useCart();
  const { branch, whatsapp, branchOpen } = useBranch();
  const { profile, isCustomer } = useAuth();
  const { show, Toast } = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    reference: '',
    orderType: 'delivery',
    payment: 'efectivo',
    comments: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('form');
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const submitLock = useRef(false);

  const delivery = form.orderType === 'delivery' ? (branch?.deliveryCost || deliveryFee || 0) : 0;
  const totalWithDelivery = form.orderType === 'delivery' ? subtotal + delivery : subtotal;

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
    submitLock.current = false;
  };

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const scrollToField = (e) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const validate = () => {
    if (!form.name.trim()) return 'Ingresa tu nombre';
    if (!form.phone.trim() || form.phone.length < 8) return 'Ingresa un teléfono válido';
    if (form.orderType === 'delivery' && !form.address.trim()) return 'Ingresa tu dirección';
    if (!items.length) return 'Tu carrito está vacío';
    if (!branch) return 'Selecciona una sucursal';
    if (!branchOpen) return 'La sucursal está cerrada en este momento';
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
          address: form.orderType === 'delivery'
            ? `${form.address.trim()}${form.reference ? ` (${form.reference})` : ''}`
            : branch.address,
          comments: form.comments.trim(),
        },
        items: [...items],
        subtotal,
        deliveryFee: delivery,
        total: totalWithDelivery,
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
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-4 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-[#1fb855]"
              >
                <MessageCircle className="h-5 w-5" />
                Enviar comprobante por WhatsApp
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {ORDER_TYPES.map((t) => (
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
                <>
                  <input
                    required
                    placeholder="Dirección de entrega"
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    onFocus={scrollToField}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                  />
                  <input
                    placeholder="Referencia (depto, piso…)"
                    value={form.reference}
                    onChange={(e) => update('reference', e.target.value)}
                    onFocus={scrollToField}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                  />
                </>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Método de pago
                </label>
                <p className="mb-2 text-xs text-gray-500">Efectivo o transferencia bancaria</p>
                <div className="flex gap-2">
                  {PAYMENT_METHODS.map((p) => {
                    const selected = form.payment === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => update('payment', p.id)}
                        aria-pressed={selected}
                        className={`checkout-pay-btn ${selected ? 'is-selected' : ''}`}
                      >
                        <span className="checkout-pay-btn__icon" aria-hidden>{p.icon}</span>
                        <span className="checkout-pay-btn__label">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                  {PAYMENT_METHODS.find((p) => p.id === form.payment)?.desc}
                </p>
                {form.payment === 'transferencia' && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
                    <p className="font-bold text-blue-900">Datos para transferencia</p>
                    <ul className="mt-2 space-y-1 text-blue-800">
                      <li><strong>Banco:</strong> {TRANSFER_BANK_INFO.banco}</li>
                      <li><strong>Tipo:</strong> {TRANSFER_BANK_INFO.tipo}</li>
                      <li><strong>Titular:</strong> {TRANSFER_BANK_INFO.nombre}</li>
                      <li><strong>RUT:</strong> {TRANSFER_BANK_INFO.rut}</li>
                      <li><strong>N° cuenta:</strong> {TRANSFER_BANK_INFO.numero}</li>
                    </ul>
                    <p className="mt-3 text-xs text-blue-700">
                      Después de confirmar podrás enviar el comprobante por WhatsApp.
                    </p>
                  </div>
                )}
              </div>

              <textarea
                placeholder="Observaciones del pedido"
                value={form.comments}
                onChange={(e) => update('comments', e.target.value)}
                onFocus={scrollToField}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                rows={3}
              />
            </div>

            <footer className="checkout-modal__footer">
              <div className="mb-4 space-y-1.5 rounded-xl bg-pollon-cream/80 px-4 py-3">
                <div className="flex justify-between text-sm text-gray-700">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                {delivery > 0 && (
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>Delivery</span>
                    <span>{money(delivery)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-black/5 pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span className="text-pollon-red">{money(totalWithDelivery)}</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
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
