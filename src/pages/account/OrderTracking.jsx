import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Circle, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getOrderById, getOrderStatusHistory, subscribeOrderUpdates } from '../../services/customerService';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STEPS } from '../../utils/constants';
import { money, formatDateTime } from '../../utils/format';
import { isSupabaseConfigured } from '../../services/supabaseClient';

export function OrderTracking() {
  const { orderId } = useParams();
  const { profile } = useAuth();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId || !profile?.id) return;

    async function load() {
      setLoading(true);
      try {
        if (isSupabaseConfigured() && !String(profile.id).startsWith('local-')) {
          const o = await getOrderById(orderId, profile.id);
          setOrder(o);
          const h = await getOrderStatusHistory(orderId);
          setHistory(h);
        }
      } finally {
        setLoading(false);
      }
    }
    load();

    if (!isSupabaseConfigured() || String(profile.id).startsWith('local-')) return undefined;

    const unsub = subscribeOrderUpdates(orderId, async (updated) => {
      if (updated) setOrder(updated);
      const h = await getOrderStatusHistory(orderId);
      setHistory(h);
    });
    return unsub;
  }, [orderId, profile?.id]);

  if (loading) return <div className="rounded-2xl bg-white p-8 text-center shadow-sm">Cargando seguimiento…</div>;
  if (!order) return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <p>Pedido no encontrado</p>
      <Link to="/cuenta/pedidos" className="mt-4 text-pollon-red font-semibold">← Mis pedidos</Link>
    </div>
  );

  const current = order.estado || 'pendiente';
  const isCancelled = current === 'cancelado';
  const currentStep = ORDER_STATUS_LABELS[current]?.step || 1;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <Link to="/cuenta/pedidos" className="text-sm font-semibold text-pollon-red hover:underline">← Mis pedidos</Link>
      <h1 className="mt-4 font-display text-3xl text-pollon-black">Seguimiento del pedido</h1>
      <p className="text-sm text-gray-500">#{order.ticketNumber} · {formatDateTime(order.createdAt)}</p>

      <div className={`mt-6 inline-flex rounded-full px-4 py-2 text-sm font-bold text-white ${ORDER_STATUS_LABELS[current]?.color || 'bg-gray-500'}`}>
        {ORDER_STATUS_LABELS[current]?.label || current}
      </div>

      {!isCancelled && (
        <div className="mt-10 space-y-0">
          {ORDER_STATUS_STEPS.map((step, i) => {
            const meta = ORDER_STATUS_LABELS[step];
            const done = meta.step <= currentStep;
            const active = step === current;
            return (
              <div key={step} className="flex gap-4">
                <div className="flex flex-col items-center">
                  {done ? (
                    <CheckCircle className={`h-8 w-8 ${active ? 'text-pollon-red' : 'text-green-500'}`} />
                  ) : (
                    <Circle className="h-8 w-8 text-gray-200" />
                  )}
                  {i < ORDER_STATUS_STEPS.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[40px] ${done ? 'bg-pollon-red' : 'bg-gray-200'}`} />
                  )}
                </div>
                <div className="pb-8 pt-1">
                  <p className={`font-bold ${active ? 'text-pollon-red' : done ? 'text-gray-800' : 'text-gray-400'}`}>
                    {meta.label}
                  </p>
                  {active && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" /> Actualización en tiempo real
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCancelled && <p className="mt-6 text-red-600 font-medium">Este pedido fue cancelado.</p>}

      <div className="mt-8 rounded-xl bg-pollon-cream p-4">
        <p className="font-bold">Resumen</p>
        <p className="text-sm text-gray-600 mt-1">Total: {money(order.total)}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {(order.items || []).map((it, i) => (
            <li key={i}>{it.qty}× {it.name}</li>
          ))}
        </ul>
      </div>

      {history.length > 0 && (
        <div className="mt-6">
          <p className="font-semibold text-sm">Historial</p>
          <ul className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-gray-500 flex justify-between">
                <span>{ORDER_STATUS_LABELS[h.status]?.label || h.status}</span>
                <span>{formatDateTime(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
