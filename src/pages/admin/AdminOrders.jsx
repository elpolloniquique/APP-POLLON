import { useState, useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { money, formatDateTime, nextEstado, estadoLabel } from '../../utils/format';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ORDER_STATES } from '../../utils/constants';

export function AdminOrders() {
  const { orders, updateOrder, refresh } = useOrders();
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [alarmOn, setAlarmOn] = useState(false);

  const filtered = useMemo(() => orders.filter((o) => {
    const d = (o.createdAt || '').substring(0, 10);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    if (estado && o.estado !== estado) return false;
    if (search) {
      const q = search.toLowerCase();
      const n = (o.customer?.name || '').toLowerCase();
      const t = (o.customer?.phone || '').toLowerCase();
      if (!n.includes(q) && !t.includes(q)) return false;
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
    await updateOrder({ ...order, estado: next, deliveredAt: next === 'entregado' ? new Date().toISOString() : order.deliveredAt });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Pedidos en tiempo real</h2>
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
              <th className="p-3">Código</th><th className="p-3">Cliente</th><th className="p-3">Teléfono</th>
              <th className="p-3">Total</th><th className="p-3">Estado</th><th className="p-3">Fecha</th><th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono">{o.codigo_pedido || o.ticketNumber}</td>
                <td className="p-3">{o.customer?.name}</td>
                <td className="p-3">{o.customer?.phone}</td>
                <td className="p-3 font-semibold">{money(o.total)}</td>
                <td className="p-3"><Badge estado={o.estado}>{estadoLabel(o.estado)}</Badge></td>
                <td className="p-3 text-xs">{formatDateTime(o.createdAt)}</td>
                <td className="p-3">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => changeEstado(o)}>Cambiar estado</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="p-8 text-center text-gray-500">Sin pedidos</p>}
      </div>
    </div>
  );
}
