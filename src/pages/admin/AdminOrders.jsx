import { useState, useMemo, useEffect, useCallback } from 'react';
import { Eye, Printer, RefreshCw } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { money, formatDateTime, nextEstado, estadoLabel } from '../../utils/format';
import { printThermalReceipt } from '../../utils/orderReceipt';
import { adminListAllBranches } from '../../services/branchService';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { OrderDetailModal } from '../../components/admin/OrderDetailModal';
import { ORDER_STATES } from '../../utils/constants';

export function AdminOrders() {
  const [alarmOn, setAlarmOn] = useState(true);
  const { orders, updateOrder, refresh, ready, realtimeStatus, isBackendReady } = useOrders({ alarmEnabled: alarmOn });
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [viewOrder, setViewOrder] = useState(null);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    adminListAllBranches().then(setBranches).catch(() => {});
  }, []);

  const branchFor = useCallback(
    (order) => branches.find((b) => b.id === order.branchId) || { name: 'El Pollón' },
    [branches]
  );

  const filtered = useMemo(() => orders.filter((o) => {
    const d = (o.createdAt || '').substring(0, 10);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    if (estado && o.estado !== estado) return false;
    if (search) {
      const q = search.toLowerCase();
      const n = (o.customer?.name || '').toLowerCase();
      const t = (o.customer?.phone || '').toLowerCase();
      const c = String(o.codigo_pedido || o.ticketNumber || '').toLowerCase();
      if (!n.includes(q) && !t.includes(q) && !c.includes(q)) return false;
    }
    return true;
  }), [orders, estado, search, desde, hasta]);

  const exportCsv = () => {
    const rows = [['Código', 'Cliente', 'Teléfono', 'Total', 'Estado', 'Fecha']];
    filtered.forEach((o) => rows.push([
      o.codigo_pedido || o.ticketNumber,
      o.customer?.name,
      o.customer?.phone,
      o.total,
      o.estado,
      o.createdAt,
    ]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos-pollon-${Date.now()}.csv`;
    a.click();
  };

  const changeEstado = async (order) => {
    const next = nextEstado(order.estado);
    const updated = {
      ...order,
      estado: next,
      deliveredAt: next === 'entregado' ? new Date().toISOString() : order.deliveredAt,
    };
    await updateOrder(updated);
    refresh();
    if (viewOrder?.id === order.id) setViewOrder(updated);
  };

  const handlePrint = (order) => {
    try {
      printThermalReceipt(order, branchFor(order));
    } catch (e) {
      alert(e.message || 'Permite ventanas emergentes para imprimir');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Pedidos en tiempo real</h2>
          <p className="text-sm text-gray-500">
            {ready && isBackendReady && realtimeStatus === 'live' && (
              <span className="inline-flex items-center gap-1 text-green-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> En vivo — los pedidos nuevos aparecen solos
              </span>
            )}
            {ready && !isBackendReady && (
              <span className="text-amber-700">Modo local — ejecuta fix-realtime-pedidos.sql en Supabase</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={refresh}>Actualizar</Button>
          <Button onClick={exportCsv}>Exportar CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border px-2 py-1 text-sm" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border px-2 py-1 text-sm" />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">
          <option value="">Todos</option>
          {ORDER_STATES.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
        </select>
        <input type="search" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border px-3 py-1 text-sm" />
        <button type="button" onClick={() => setAlarmOn(!alarmOn)} className={`rounded-lg px-3 py-1 text-sm ${alarmOn ? 'bg-pollon-red text-white' : 'bg-gray-100'}`}>
          {alarmOn ? '🔔 Alarma ON' : '🔕 Alarma OFF'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Total</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono font-semibold">{o.codigo_pedido || o.ticketNumber}</td>
                <td className="p-3">{o.customer?.name}</td>
                <td className="p-3">{o.customer?.phone}</td>
                <td className="p-3 font-semibold">{money(o.total)}</td>
                <td className="p-3"><Badge estado={o.estado}>{estadoLabel(o.estado)}</Badge></td>
                <td className="p-3 text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewOrder(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      title="Ver detalle"
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrint(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      title="Imprimir ticket 80mm"
                    >
                      <Printer className="h-3.5 w-3.5" /> Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => changeEstado(o)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-pollon-red hover:bg-red-50"
                      title="Siguiente estado"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Estado
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="p-8 text-center text-gray-500">Sin pedidos</p>}
      </div>

      {viewOrder && (
        <OrderDetailModal
          order={viewOrder}
          branch={branchFor(viewOrder)}
          onClose={() => setViewOrder(null)}
          onChangeEstado={changeEstado}
        />
      )}
    </div>
  );
}
