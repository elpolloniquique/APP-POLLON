import { money } from '../../utils/format';

export function DriverOfferCard({ offer, onAccept, onReject, loading }) {
  const job = offer?.ep_delivery_jobs || offer?.job || {};
  const expiresAt = offer?.expires_at ? new Date(offer.expires_at) : null;
  const secsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : null;

  return (
    <div className="rounded-2xl border-2 border-pollon-orange bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-pollon-red px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Nuevo pedido
        </span>
        {secsLeft != null && (
          <span className="text-sm font-bold text-pollon-orange">{secsLeft}s</span>
        )}
      </div>
      <p className="text-lg font-bold text-pollon-black">{job.customer_name || 'Cliente'}</p>
      <p className="mt-1 text-sm text-gray-600">{job.customer_address || 'Sin dirección'}</p>
      <p className="mt-1 text-xs text-gray-400">Ticket #{job.ticket_code || '—'}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-gray-50 p-2">
          <p className="text-[10px] uppercase text-gray-400">Pedido</p>
          <p className="text-sm font-bold">{money(job.order_total || 0)}</p>
        </div>
        <div className="rounded-xl bg-orange-50 p-2">
          <p className="text-[10px] uppercase text-orange-500">Delivery</p>
          <p className="text-sm font-bold text-pollon-orange">{money(offer.offered_fee || job.delivery_fee || 0)}</p>
        </div>
        <div className="rounded-xl bg-green-50 p-2">
          <p className="text-[10px] uppercase text-green-600">Cobrar</p>
          <p className="text-sm font-bold text-green-700">
            {money((job.order_total || 0) + (offer.offered_fee || job.delivery_fee || 0))}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onReject?.(offer)}
          className="rounded-xl border-2 border-red-500 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onAccept?.(offer)}
          className="rounded-xl border-2 border-green-600 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
