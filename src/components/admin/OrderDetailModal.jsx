import { X, Printer, RefreshCw } from 'lucide-react';
import { money, formatDateTime, estadoLabel, nextEstado } from '../../utils/format';
import { getOrderReceiptMeta, printThermalReceipt, paymentLabel } from '../../utils/orderReceipt';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ORDER_TYPE_LABELS } from '../../utils/constants';

export function OrderDetailModal({ order, branch, onClose, onChangeEstado, onPrint }) {
  if (!order) return null;

  const m = getOrderReceiptMeta(order, branch);
  const orderTypeLabel = ORDER_TYPE_LABELS[m.orderType] || m.orderType;

  const handlePrint = () => {
    try {
      printThermalReceipt(order, branch);
      onPrint?.();
    } catch (e) {
      alert(e.message || 'No se pudo imprimir');
    }
  };

  const handleEstado = async () => {
    const next = nextEstado(order.estado);
    await onChangeEstado?.({ ...order, estado: next, deliveredAt: next === 'entregado' ? new Date().toISOString() : order.deliveredAt });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="order-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b bg-gradient-to-r from-pollon-black to-gray-900 px-5 py-4 text-white">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-pollon-orange">Detalle del pedido</p>
            <h2 id="order-detail-title" className="font-display text-3xl tracking-wide">
              #{order.codigo_pedido || order.ticketNumber}
            </h2>
            <p className="mt-1 text-sm text-white/70">{formatDateTime(order.createdAt)} · {m.sucursal}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge estado={order.estado}>{estadoLabel(order.estado)}</Badge>
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-bold uppercase text-gray-700">
              {orderTypeLabel}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-0.5 text-xs font-bold text-amber-800">
              {paymentLabel(order.metodo_pago)}
            </span>
          </div>

          {/* Cliente */}
          <section className="mt-5 rounded-xl bg-gray-50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Cliente</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Nombre</dt>
                <dd className="font-semibold text-right">{m.customer.name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Teléfono</dt>
                <dd className="font-mono font-semibold">
                  <a href={`tel:${m.customer.phone}`} className="text-pollon-red hover:underline">{m.customer.phone || '—'}</a>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Dirección</dt>
                <dd className="mt-0.5 font-medium">{m.customer.address || '—'}</dd>
              </div>
              {m.customer.comments?.trim() && (
                <div>
                  <dt className="text-gray-500">Observaciones</dt>
                  <dd className="mt-0.5 italic text-gray-700">{m.customer.comments}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Items — mismo detalle que WhatsApp */}
          <section className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Detalle del pedido</h3>
            <ul className="mt-2 divide-y rounded-xl border border-gray-100">
              {m.items.map((it, i) => (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pollon-red/10 text-xs font-bold text-pollon-red">
                    {it.qty ?? 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{it.name}</p>
                    {it.drink && <p className="text-xs text-gray-500">Bebida: {it.drink}</p>}
                    {it.bagQty > 0 && <p className="text-xs text-gray-500">Bolsa x{it.bagQty}</p>}
                    {it.notes && <p className="text-xs text-amber-700">Nota: {it.notes}</p>}
                  </div>
                  <span className="shrink-0 font-bold">{money(it.total)}</span>
                </li>
              ))}
              {!m.items.length && <li className="px-4 py-6 text-center text-sm text-gray-400">Sin productos</li>}
            </ul>
          </section>

          {/* Totales */}
          <section className="mt-4 rounded-xl border-2 border-pollon-red/20 bg-red-50/50 p-4">
            {m.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Delivery</span>
                <span>{money(m.deliveryFee)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-lg font-bold text-pollon-red">
              <span>TOTAL</span>
              <span>{money(m.total)}</span>
            </div>
          </section>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 border-t bg-gray-50 px-5 py-4">
          <Button type="button" onClick={handlePrint} className="flex flex-1 items-center justify-center gap-2">
            <Printer className="h-4 w-4" /> Imprimir 80mm
          </Button>
          <Button type="button" variant="ghost" onClick={handleEstado} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> {estadoLabel(nextEstado(order.estado))}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
