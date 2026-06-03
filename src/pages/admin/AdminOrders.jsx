import { useState, useMemo, useEffect, useCallback } from 'react';
import { Eye, Printer, RefreshCw } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { money, formatDateTime, nextEstado, estadoLabel, todayISO } from '../../utils/format';
import { printThermalReceipt } from '../../utils/orderReceipt';
import { adminListAllBranches } from '../../services/branchService';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { OrderDetailModal } from '../../components/admin/OrderDetailModal';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { AdminTable } from '../../components/admin/AdminTable';
import { ORDER_STATES } from '../../utils/constants';

export function AdminOrders() {
  const [alarmOn, setAlarmOn] = useState(true);
  const { isBranchScoped } = useStaffBranch();
  const {
    applyBranchFilter,
    showBranchFilter,
    branches: branchList,
    selectedBranchId,
    setSelectedBranchId,
    headerBranchLabel,
  } = useAdminBranchFilter();
  const { orders, updateOrder, refresh, ready, realtimeStatus, isBackendReady } = useOrders({ alarmEnabled: alarmOn });
  const ordersScoped = useMemo(() => applyBranchFilter(orders), [orders, applyBranchFilter]);
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState(() => todayISO());
  const [hasta, setHasta] = useState(() => todayISO());
  const [viewOrder, setViewOrder] = useState(null);
  const [branches, setBranches] = useState([]);

  const today = todayISO();
  const showingTodayOnly = desde === today && hasta === today;
  const showingAllDays = !desde && !hasta;

  const resetToToday = () => {
    setDesde(todayISO());
    setHasta(todayISO());
  };

  useEffect(() => {
    if (showBranchFilter) {
      setBranches(branchList);
    } else {
      adminListAllBranches().then(setBranches).catch(() => {});
    }
  }, [showBranchFilter, branchList]);

  const branchFor = useCallback(
    (order) => branches.find((b) => b.id === order.branchId) || { name: 'El Pollón' },
    [branches],
  );

  const filtered = useMemo(() => ordersScoped.filter((o) => {
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
  }), [ordersScoped, estado, search, desde, hasta]);

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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
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

  const statusLine = ready && isBackendReady && realtimeStatus === 'live' ? (
    <span className="inline-flex items-center gap-1 text-green-700">
      <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> En vivo
    </span>
  ) : ready && !isBackendReady ? (
    <span className="text-amber-700">Modo local</span>
  ) : null;

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Pedidos en tiempo real"
        subtitle={statusLine}
        branchLabel={isBranchScoped || selectedBranchId ? headerBranchLabel : undefined}
        actions={(
          <>
            {showBranchFilter && (
              <AdminBranchFilter
                branches={branchList}
                value={selectedBranchId}
                onChange={setSelectedBranchId}
              />
            )}
            <Button variant="ghost" onClick={refresh}>Actualizar</Button>
            <Button onClick={exportCsv}>Exportar CSV</Button>
          </>
        )}
      />

      <div className="admin-toolbar admin-toolbar--orders">
        <div className="admin-toolbar__dates">
          <label className="admin-toolbar__date-field">
            <span className="admin-toolbar__date-label">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="admin-toolbar__date-field">
            <span className="admin-toolbar__date-label">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          {!showingTodayOnly && (
            <button type="button" onClick={resetToToday} className="admin-toolbar__today-btn">
              Hoy
            </button>
          )}
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full sm:w-auto">
          <option value="">Todos los estados</option>
          {ORDER_STATES.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
        </select>
        <input type="search" placeholder="Buscar cliente, teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[160px] flex-1" />
        <button type="button" onClick={() => setAlarmOn(!alarmOn)} className={`rounded-lg px-3 py-1.5 text-sm font-medium sm:py-2 ${alarmOn ? 'bg-pollon-red text-white' : 'bg-gray-100'}`}>
          {alarmOn ? '🔔 Alarma ON' : '🔕 OFF'}
        </button>
      </div>

      <p className="admin-orders-filter-hint">
        {showingAllDays
          ? 'Mostrando pedidos de todos los días. Elige fechas arriba para filtrar por rango.'
          : showingTodayOnly
            ? 'Mostrando pedidos de hoy. Cambia las fechas para ver otro día o un rango.'
            : `Mostrando del ${desde.split('-').reverse().join('-')} al ${hasta.split('-').reverse().join('-')}.`}
      </p>

      <AdminTable
        count={filtered.length}
        countLabel={`${filtered.length} pedido${filtered.length !== 1 ? 's' : ''}`}
        emptyMessage="Sin pedidos"
        minWidth={720}
        columns={[
          { key: 'code', label: 'Código' },
          { key: 'branch', label: 'Sucursal', className: 'hidden lg:table-cell' },
          { key: 'client', label: 'Cliente' },
          { key: 'phone', label: 'Teléfono', className: 'hidden sm:table-cell' },
          { key: 'total', label: 'Total' },
          { key: 'status', label: 'Estado' },
          { key: 'date', label: 'Fecha', className: 'hidden md:table-cell' },
          { key: 'actions', label: 'Acciones' },
        ]}
      >
        {filtered.map((o) => (
          <tr key={o.id} className="border-t hover:bg-gray-50">
            <td className="p-2 font-mono text-xs font-semibold sm:p-3 sm:text-sm">{o.codigo_pedido || o.ticketNumber}</td>
            <td className="hidden p-2 text-xs lg:table-cell sm:p-3">{branchFor(o).name}</td>
            <td className="max-w-[120px] truncate p-2 sm:max-w-none sm:p-3">{o.customer?.name}</td>
            <td className="hidden p-2 sm:table-cell sm:p-3">{o.customer?.phone}</td>
            <td className="p-2 font-semibold sm:p-3">{money(o.total)}</td>
            <td className="p-2 sm:p-3"><Badge estado={o.estado}>{estadoLabel(o.estado)}</Badge></td>
            <td className="hidden whitespace-nowrap p-2 text-xs md:table-cell sm:p-3">{formatDateTime(o.createdAt)}</td>
            <td className="p-2 sm:p-3">
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => setViewOrder(o)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold sm:text-xs" title="Ver">
                  <Eye className="h-3.5 w-3.5" /> Ver
                </button>
                <button type="button" onClick={() => handlePrint(o)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 sm:text-xs" title="Imprimir">
                  <Printer className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => changeEstado(o)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-pollon-red sm:text-xs" title="Estado">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

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
