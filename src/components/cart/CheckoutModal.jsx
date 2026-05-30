import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { money, buildWhatsappMessage } from '../../utils/format';
import { PAYMENT_METHODS, TRANSFER_BANK_INFO, ORDER_TYPE_LABELS } from '../../utils/constants';
import * as orderService from '../../services/orderService';
import { useToast } from '../../hooks/useToast';

const ORDER_TYPES = ['delivery', 'retiro', 'reserva'];

export function CheckoutModal() {
  const { items, subtotal, deliveryFee, clearCart, checkoutOpen, setCheckoutOpen } = useCart();
  const { branch, whatsapp, branchOpen } = useBranch();
  const { profile, isCustomer } = useAuth();
  const navigate = useNavigate();
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

  const delivery = form.orderType === 'delivery' ? (branch?.deliveryCost || deliveryFee || 0) : 0;
  const totalWithDelivery = form.orderType === 'delivery' ? subtotal + delivery : subtotal;

  useEffect(() => {
    if (!checkoutOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [checkoutOpen]);

  useEffect(() => {
    if (!checkoutOpen) return;
    if (!items.length) setCheckoutOpen(false);
  }, [checkoutOpen, items.length, setCheckoutOpen]);

  useEffect(() => {
    if (checkoutOpen && isCustomer && profile) {
      setForm((f) => ({
        ...f,
        name: f.name || profile.fullName || profile.nombre || '',
        phone: f.phone || profile.phone || '',
      }));
    }
  }, [checkoutOpen, isCustomer, profile]);

  if (!checkoutOpen || !items.length) {
    return Toast;
  }

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
    const err = validate();
    if (err) { show(err); return; }

    setSubmitting(true);
    try {
      const existing = orderService.getOrders();
      const ticketNumber = orderService.generateTicketNumber(existing);
      const order = {
        id: orderService.generateOrderId(),
        ticketNumber,
        codigo_pedido: ticketNumber,
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

      await orderService.saveOrder(order);
      const msg = buildWhatsappMessage(order, branch);
      window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
      clearCart();
      setCheckoutOpen(false);
      navigate(`/pedido/${order.id}`, { state: { order } });
    } catch (ex) {
      show(ex.message || 'Error al guardar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {Toast}
      <div
        className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-4"
        onClick={() => setCheckoutOpen(false)}
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
              onClick={() => setCheckoutOpen(false)}
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
                <p className="mb-3 text-xs text-gray-500">Solo aceptamos efectivo o transferencia bancaria</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PAYMENT_METHODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => update('payment', p.id)}
                      className={`rounded-xl border-2 p-4 text-left transition ${
                        form.payment === p.id
                          ? 'border-pollon-red bg-red-50/80'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{p.icon}</span>
                      <p className="mt-1 font-bold text-sm">{p.label}</p>
                      <p className="text-xs text-gray-500">{p.desc}</p>
                    </button>
                  ))}
                </div>
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
                      Envía el comprobante por WhatsApp al confirmar.
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
                {submitting ? 'Procesando…' : 'Confirmar y enviar por WhatsApp'}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </>
  );
}
