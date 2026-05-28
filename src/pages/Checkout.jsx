import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { useCart } from '../context/CartContext';
import { useBranch } from '../context/BranchContext';
import { money, buildWhatsappMessage } from '../utils/format';
import { PAYMENT_METHODS, TRANSFER_BANK_INFO } from '../utils/constants';
import * as orderService from '../services/orderService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';

export function Checkout() {
  const { items, subtotal, deliveryFee, clearCart, setIsOpen } = useCart();
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

  const totalWithDelivery = form.orderType === 'delivery' ? subtotal + (branch?.deliveryCost || deliveryFee) : subtotal;
  const delivery = form.orderType === 'delivery' ? (branch?.deliveryCost || 0) : 0;

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
          address: form.orderType === 'delivery' ? `${form.address.trim()}${form.reference ? ` (${form.reference})` : ''}` : branch.address,
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
      navigate(`/pedido/${order.id}`, { state: { order } });
    } catch (ex) {
      show(ex.message || 'Error al guardar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-pollon-cream p-8">
        <p className="text-lg">No hay productos en el carrito</p>
        <Link to="/tienda" className="mt-4 rounded-lg bg-pollon-red px-6 py-3 font-bold text-white">Volver a la tienda</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-pollon-cream">
      <SiteHeader onOpenCart={() => setIsOpen(true)} variant="compact" />
      {Toast}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="font-display text-4xl text-pollon-black">CONFIRMAR PEDIDO</h1>
        <p className="text-sm text-gray-500">Sucursal: {branch?.name}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <label className="text-sm font-bold uppercase text-gray-500">Tipo de pedido</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {['delivery', 'retiro', 'reserva'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update('orderType', t)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold capitalize ${
                    form.orderType === t ? 'bg-pollon-red text-white' : 'bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <input required placeholder="Nombre completo" value={form.name} onChange={(e) => update('name', e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input required placeholder="Teléfono" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="w-full rounded-xl border px-4 py-3" />

          {form.orderType === 'delivery' && (
            <>
              <input required placeholder="Dirección de entrega" value={form.address} onChange={(e) => update('address', e.target.value)} className="w-full rounded-xl border px-4 py-3" />
              <input placeholder="Referencia (depto, piso…)" value={form.reference} onChange={(e) => update('reference', e.target.value)} className="w-full rounded-xl border px-4 py-3" />
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-bold uppercase text-gray-500">Método de pago</label>
            <p className="mb-3 text-xs text-gray-500">Solo aceptamos efectivo o transferencia bancaria</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update('payment', p.id)}
                  className={`rounded-xl border-2 p-4 text-left transition ${
                    form.payment === p.id ? 'border-pollon-red bg-red-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <p className="mt-1 font-bold">{p.label}</p>
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
                  Envía el comprobante por WhatsApp al confirmar. Tu pedido se prepara al validar el pago.
                </p>
              </div>
            )}
          </div>

          <textarea placeholder="Observaciones del pedido" value={form.comments} onChange={(e) => update('comments', e.target.value)} className="w-full rounded-xl border px-4 py-3" rows={3} />

          <div className="rounded-xl bg-pollon-cream p-4">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {delivery > 0 && <div className="flex justify-between text-sm"><span>Delivery</span><span>{money(delivery)}</span></div>}
            <div className="mt-2 flex justify-between text-lg font-bold"><span>Total</span><span className="text-pollon-red">{money(totalWithDelivery)}</span></div>
          </div>

          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-pollon-red py-4 font-bold uppercase text-white hover:bg-pollon-red-dark disabled:opacity-50">
            {submitting ? 'Procesando…' : 'Confirmar y enviar por WhatsApp'}
          </button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
