import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCustomerOrders } from '../../services/customerService';
import { ORDER_STATUS_LABELS } from '../../utils/constants';
import { money, formatDateTime } from '../../utils/format';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { getOrders } from '../../services/orderService';

export function AccountOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (isSupabaseConfigured() && profile?.id && !String(profile.id).startsWith('local-')) {
          const list = await getCustomerOrders(profile.id);
          setOrders(list);
        } else {
          const all = getOrders();
          const phone = profile?.phone;
          setOrders(all.filter((o) => o.customer?.phone === phone || o.customer?.name === profile?.fullName));
        }
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile]);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="font-display text-3xl text-pollon-black">Mis pedidos</h1>
      <p className="mt-1 text-sm text-gray-500">Historial y seguimiento en tiempo real</p>

      {loading ? (
        <p className="mt-8 text-center text-gray-500">Cargando pedidos…</p>
      ) : !orders.length ? (
        <div className="mt-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">Aún no tienes pedidos</p>
          <Link to="/tienda" className="mt-4 inline-block rounded-xl bg-pollon-red px-6 py-2 text-sm font-bold text-white">Ir a la tienda</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => {
            const st = ORDER_STATUS_LABELS[o.estado] || { label: o.estado };
            return (
              <li key={o.id}>
                <Link
                  to={`/cuenta/seguimiento/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition hover:border-pollon-red hover:shadow-sm"
                >
                  <div>
                    <p className="font-bold">#{o.ticketNumber || o.id?.slice(-6)}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(o.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${st.color || 'bg-gray-500'}`}>
                    {st.label}
                  </span>
                  <p className="font-bold text-pollon-red">{money(o.total)}</p>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
