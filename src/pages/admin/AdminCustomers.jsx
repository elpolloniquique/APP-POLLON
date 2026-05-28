import { useEffect, useState } from 'react';
import { Search, Mail, Phone, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { adminListCustomers, adminGetCustomerOrders } from '../../services/customerService';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { money, formatDateTime } from '../../utils/format';

export function AdminCustomers() {
  const { profile, canAccessBranch } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterPromo, setFilterPromo] = useState('all');
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const branchId = profile?.branchId || profile?.branch_id;

  const load = async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const list = await adminListCustomers({
        branchId: profile?.rol === 'super_admin' ? undefined : branchId,
        search: search || undefined,
        acceptsPromotions: filterPromo === 'promo' ? true : undefined,
      });
      setCustomers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, filterPromo, branchId]);

  const viewCustomer = async (c) => {
    setSelected(c);
    const o = await adminGetCustomerOrders(c.id);
    setOrders(o);
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-amber-900">
        <h2 className="text-xl font-bold">Clientes</h2>
        <p className="mt-2 text-sm">Ejecuta schema-auth.sql en Supabase para habilitar el módulo de clientes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-pollon-black">Clientes registrados</h2>
        <p className="text-sm text-gray-500">Buscar, segmentar y ver historial de compras</p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, email o teléfono…" className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm" />
        </div>
        <select value={filterPromo} onChange={(e) => setFilterPromo(e.target.value)} className="rounded-xl border px-4 py-2 text-sm">
          <option value="all">Todos los clientes</option>
          <option value="promo">Aceptan promociones por email</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {loading ? <p className="p-8 text-center text-gray-500">Cargando…</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3">Promos</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} onClick={() => viewCustomer(c)} className={`cursor-pointer border-t hover:bg-red-50 ${selected?.id === c.id ? 'bg-red-50' : ''}`}>
                    <td className="p-3">
                      <p className="font-semibold">{c.fullName}</p>
                      <p className="text-xs text-gray-400">{c.isActive ? 'Activo' : 'Inactivo'}</p>
                    </td>
                    <td className="p-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email || '—'}</span>
                      <span className="flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{c.phone || '—'}</span>
                    </td>
                    <td className="p-3">{c.acceptsEmail ? '✅ Email' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !customers.length && <p className="p-8 text-center text-gray-500">Sin clientes</p>}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {selected ? (
            <>
              <h3 className="font-bold text-lg">{selected.fullName}</h3>
              <p className="text-sm text-gray-500 mt-1">{selected.email} · {selected.phone}</p>
              <p className="mt-2 text-xs">
                Promociones email: {selected.acceptsEmail ? 'Sí' : 'No'} · WhatsApp: {selected.acceptsWhatsapp ? 'Sí' : 'No'}
              </p>
              <h4 className="mt-6 flex items-center gap-2 font-bold text-sm"><ShoppingBag className="h-4 w-4" /> Historial de pedidos</h4>
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-semibold">#{o.ticketNumber}</span>
                      <span className="text-pollon-red font-bold">{money(o.total)}</span>
                    </div>
                    <p className="text-xs text-gray-500">{formatDateTime(o.createdAt)} · {o.estado}</p>
                  </li>
                ))}
                {!orders.length && <p className="text-gray-500 text-sm">Sin pedidos</p>}
              </ul>
            </>
          ) : (
            <p className="text-center text-gray-500 py-12">Selecciona un cliente para ver detalle</p>
          )}
        </div>
      </div>
    </div>
  );
}
