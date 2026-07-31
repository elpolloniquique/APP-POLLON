import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, ChevronDown, Phone, ShoppingBag, Bike, Banknote, X, User,
} from 'lucide-react';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { money, normalizeWhatsappPhone } from '../../utils/format';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { PAYMENT_METHODS } from '../../utils/constants';

function paymentLabel(id) {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label || id || '—';
}

async function fetchOrderLines(orderId) {
  if (!orderId || !isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data } = await sb
    .from('detalle_pedidos')
    .select('nombre_producto, cantidad, subtotal')
    .eq('pedido_id', orderId);
  return (data || []).map((d) => ({
    name: d.nombre_producto,
    qty: d.cantidad,
    subtotal: d.subtotal,
  }));
}

function OfferDetailPopover({ open, onClose, job, fee, items, loading }) {
  if (!open) return null;
  const subtotal = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0) || Number(job.order_total) || 0;
  const delivery = Number(fee) || 0;
  const dist = job.delivery_distance_km != null ? Number(job.delivery_distance_km) : null;
  const total = subtotal + delivery;

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xs overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Detalle del pedido"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-pollon-red">Detalle del pedido</p>
          <p className="text-sm font-semibold text-gray-900">#{job.ticket_code || '—'}</p>
        </div>
        <div className="max-h-56 space-y-1.5 overflow-y-auto px-4 py-3">
          {loading && <p className="text-center text-xs text-gray-400">Cargando…</p>}
          {!loading && items.length === 0 && (
            <p className="text-center text-xs text-gray-400">Sin detalle de platos</p>
          )}
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 text-gray-800">
                <span className="font-semibold text-gray-500">{it.qty || 1}x</span> {it.name}
              </span>
              {it.subtotal != null && (
                <span className="shrink-0 font-medium text-gray-700">{money(it.subtotal)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-gray-100 px-4 py-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Delivery{dist != null ? ` (${dist.toFixed(1)} km)` : ''}</span>
            <span>{money(delivery)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900">
            <span>TOTAL</span>
            <span className="text-pollon-red">{money(total)}</span>
          </div>
          <p className="pt-1 text-xs text-gray-500">
            Pago: <strong>{paymentLabel(job.payment_method)}</strong>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Card "Nuevo pedido" flotante sobre el mapa (diseño panel repartidor).
 */
export function DriverOfferCard({ offer, onAccept, onReject, loading }) {
  const job = offer?.ep_delivery_jobs || offer?.job || {};
  const fee = offer.offered_fee || job.delivery_fee || 0;
  const orderTotal = job.order_total || 0;
  const charge = orderTotal + fee;
  const phone = job.customer_phone || '';
  const wa = normalizeWhatsappPhone(phone);

  const [detailOpen, setDetailOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresAt = offer?.expires_at ? new Date(offer.expires_at) : null;
  const secsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : null;

  const openDetail = async () => {
    setDetailOpen(true);
    setItemsLoading(true);
    try {
      const lines = await fetchOrderLines(job.source_order_id);
      setItems(lines);
    } finally {
      setItemsLoading(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5">
          <span className="rounded-full bg-pollon-red px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            Nuevo pedido
          </span>
          <div className="flex items-center gap-2">
            {secsLeft != null && (
              <span className="text-xs font-bold text-pollon-orange">{secsLeft}s</span>
            )}
            <button
              type="button"
              onClick={openDetail}
              className="inline-flex items-center gap-1 rounded-lg border border-pollon-red bg-white px-2.5 py-1 text-[11px] font-bold text-pollon-red"
            >
              Ver
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2.5 px-3.5 py-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pollon-red text-white">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-gray-900">{job.customer_name || 'Cliente'}</p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-pollon-red">
              {job.customer_address || 'Sin dirección'}
            </p>
          </div>
        </div>

        {phone && (
          <div className="flex flex-wrap items-center gap-3 px-3.5 pb-2">
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pollon-red text-white">
                  <WhatsAppIcon className="h-4 w-4" />
                </span>
                {phone}
              </a>
            )}
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pollon-red text-white">
                <Phone className="h-4 w-4" />
              </span>
              {phone}
            </a>
          </div>
        )}

        <div className="mx-3.5 mb-3 grid grid-cols-3 gap-0 overflow-hidden rounded-xl border border-gray-200">
          <div className="border-r border-gray-200 px-2 py-2.5 text-center">
            <ShoppingBag className="mx-auto h-4 w-4 text-pollon-red" />
            <p className="mt-1 text-[9px] font-medium uppercase text-gray-400">Monto pedido</p>
            <p className="text-xs font-bold text-gray-900">{money(orderTotal)}</p>
          </div>
          <div className="border-r border-gray-200 px-2 py-2.5 text-center">
            <Bike className="mx-auto h-4 w-4 text-pollon-red" />
            <p className="mt-1 text-[9px] font-medium uppercase text-gray-400">Delivery</p>
            <p className="text-xs font-bold text-gray-900">{money(fee)}</p>
          </div>
          <div className="px-2 py-2.5 text-center">
            <Banknote className="mx-auto h-4 w-4 text-pollon-red" />
            <p className="mt-1 text-[9px] font-medium uppercase text-gray-400">Total a cobrar</p>
            <p className="text-xs font-bold text-pollon-red">{money(charge)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-3.5 pb-3.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => onReject?.(offer)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-pollon-red bg-white py-3 text-sm font-bold text-pollon-red disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Rechazar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onAccept?.(offer)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-pollon-red py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Aceptar
          </button>
        </div>
      </div>

      <OfferDetailPopover
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        job={job}
        fee={fee}
        items={items}
        loading={itemsLoading}
      />
    </>
  );
}
