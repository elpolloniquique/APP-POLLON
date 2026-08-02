import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Eye, Printer, RefreshCw, Search, Truck } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { money, formatDateTime, estadoLabel, todayISO } from '../../utils/format';
import { printThermalReceiptSmart } from '../../utils/networkPrinter';
import { adminListAllBranches } from '../../services/branchService';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { OrderDetailModal } from '../../components/admin/OrderDetailModal';
import { CajaPagoControl } from '../../components/admin/CajaPagoControl';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { AdminTable } from '../../components/admin/AdminTable';
import { ORDER_STATES, canAdvanceOrderEstado, getNextOrderEstado } from '../../utils/constants';
import { cajaPagoLabel, resolveCajaPagoStatus } from '../../utils/cajaPago';
import {
  fetchDeliveryJobMap,
  autoDispatchNewOrder,
  manualSearchDrivers,
  fetchDriverNamesForFilter,
  clearCache as clearDeliveryCache,
  retryStaleDriverSearches,
} from '../../services/orderDeliveryService';

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
  const [driverFilter, setDriverFilter] = useState('');
  const [cajaPagoFilter, setCajaPagoFilter] = useState('');
  const [desde, setDesde] = useState(() => todayISO());
  const [hasta, setHasta] = useState(() => todayISO());
  const [viewOrder, setViewOrder] = useState(null);
  const [branches, setBranches] = useState([]);
  const [cajaBusy, setCajaBusy] = useState({});

  // Delivery integration
  const [deliveryMap, setDeliveryMap] = useState({});
  const [driverNames, setDriverNames] = useState([]);
  const [searchingDriver, setSearchingDriver] = useState({});
  const autoDispatchedRef = useRef(new Set());

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

  // Fetch delivery job map periodically
  const refreshDelivery = useCallback(async () => {
    const map = await fetchDeliveryJobMap();
    setDeliveryMap({ ...map });
  }, []);

  useEffect(() => {
    refreshDelivery();
    fetchDriverNamesForFilter().then(setDriverNames).catch(() => {});
    const t = setInterval(refreshDelivery, 8000);
    return () => clearInterval(t);
  }, [refreshDelivery]);

  // Auto-dispatch new delivery orders
  useEffect(() => {
    if (!ready) return;
    const deliveryOrders = ordersScoped.filter(
      (o) => o.orderType === 'delivery' && o.estado === 'pendiente' && !autoDispatchedRef.current.has(o.id)
    );
    for (const o of deliveryOrders) {
      autoDispatchedRef.current.add(o.id);
      autoDispatchNewOrder(o.id).then(() => {
        setTimeout(refreshDelivery, 1500);
      });
    }
  }, [ordersScoped, ready, refreshDelivery]);

  // Re-ofertar cada ~20s si nadie aceptó tras 3 min (TTL oferta 1 min)
  useEffect(() => {
    if (!ready) return undefined;
    const tick = () => {
      retryStaleDriverSearches()
        .then((r) => {
          if (r?.retried > 0) setTimeout(refreshDelivery, 800);
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [ready, refreshDelivery]);

  // When delivery job shows accepted, update pedido estado to "aceptado"
  useEffect(() => {
    for (const o of ordersScoped) {
      const info = deliveryMap[o.id];
      if (!info) continue;
      if (
        o.estado === 'pendiente' &&
        info.jobStatus === 'assigned' &&
        info.driverId
      ) {
        const updated = { ...o, estado: 'aceptado' };
        updateOrder(updated).then(refresh);
      }
    }
  }, [deliveryMap, ordersScoped, updateOrder, refresh]);

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
    if (driverFilter) {
      const info = deliveryMap[o.id];
      if (driverFilter === '__none') {
        if (info?.driverId) return false;
      } else {
        if (info?.driverId !== driverFilter) return false;
      }
    }
    if (cajaPagoFilter) {
      const st = resolveCajaPagoStatus(o);
      if (st !== cajaPagoFilter) return false;
    }
    return true;
  }), [ordersScoped, estado, search, desde, hasta, driverFilter, cajaPagoFilter, deliveryMap]);

  const exportCsv = () => {
    const rows = [['Código', 'Sucursal', 'Cliente', 'Teléfono', 'Total', 'Estado', 'Repartidor', 'Cobro caja', 'Fecha']];
    filtered.forEach((o) => {
      const info = deliveryMap[o.id];
      rows.push([
        o.codigo_pedido || o.ticketNumber,
        branchFor(o).name,
        o.customer?.name,
        o.customer?.phone,
        o.total,
        estadoLabel(o.estado),
        info?.driver?.full_name || 'N/A',
        cajaPagoLabel(resolveCajaPagoStatus(o)),
        o.createdAt,
      ]);
    });
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `pedidos-pollon-${Date.now()}.csv`;
    a.click();
  };

  const applyEstado = async (order, next) => {
    if (!next || next === order.estado) return;
    const updated = {
      ...order,
      estado: next,
      deliveredAt: next === 'entregado' ? new Date().toISOString() : order.deliveredAt,
    };
    await updateOrder(updated);
    refresh();
    if (viewOrder?.id === order.id) setViewOrder(updated);
  };

  const changeEstado = async (order) => {
    if (!canAdvanceOrderEstado(order.estado)) return;
    await applyEstado(order, getNextOrderEstado(order.estado));
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`¿Cancelar el pedido #${order.codigo_pedido || order.ticketNumber}? Esta acción no se puede deshacer.`)) {
      return;
    }
    await applyEstado(order, 'cancelado');
  };

  const handlePrint = async (order) => {
    try {
      await printThermalReceiptSmart(order, branchFor(order));
    } catch (e) {
      alert(e.message || 'No se pudo imprimir');
    }
  };

  const handleSearchDriver = async (order) => {
    setSearchingDriver((s) => ({ ...s, [order.id]: true }));
    try {
      await manualSearchDrivers(order.id);
      setTimeout(refreshDelivery, 2000);
    } catch (e) {
      alert(e.message || 'No se encontraron repartidores disponibles');
    } finally {
      setSearchingDriver((s) => ({ ...s, [order.id]: false }));
    }
  };

  const changeCajaPago = async (order, next) => {
    if (!next || !['na', 'por_pagar', 'pagado'].includes(next)) return;
    setCajaBusy((s) => ({ ...s, [order.id]: true }));
    try {
      const updated = { ...order, cajaPago: next };
      await updateOrder(updated);
      refresh();
      if (viewOrder?.id === order.id) setViewOrder(updated);
    } catch (e) {
      alert(e.message || 'No se pudo actualizar el cobro de caja');
    } finally {
      setCajaBusy((s) => ({ ...s, [order.id]: false }));
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
            <Button variant="ghost" onClick={() => { clearDeliveryCache(); refresh(); refreshDelivery(); }}>Actualizar</Button>
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
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="w-full sm:w-auto">
          <option value="">Todos repartidores</option>
          <option value="__none">Sin repartidor (N/A)</option>
          {driverNames.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <select value={cajaPagoFilter} onChange={(e) => setCajaPagoFilter(e.target.value)} className="w-full sm:w-auto" title="Filtro interno de caja">
          <option value="">Cobro caja: todos</option>
          <option value="na">N/A (sin repartidor)</option>
          <option value="por_pagar">Por pagar</option>
          <option value="pagado">Pagado</option>
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
        minWidth={580}
        className="admin-orders-table"
        columns={[
          { key: 'code', label: 'Código' },
          { key: 'branch', label: 'Sucursal', className: 'admin-col-branch hidden xl:table-cell' },
          { key: 'client', label: 'Cliente' },
          { key: 'phone', label: 'Tel.', className: 'admin-col-phone hidden sm:table-cell' },
          { key: 'total', label: 'Total' },
          { key: 'status', label: 'Estado' },
          { key: 'driver', label: 'Repartidor' },
          { key: 'caja', label: 'Cobro', className: 'admin-col-caja' },
          { key: 'date', label: 'Hora', className: 'admin-col-date hidden md:table-cell' },
          { key: 'actions', label: '', className: 'admin-col-actions w-[1%] whitespace-nowrap' },
        ]}
      >
        {filtered.map((o) => {
          const info = deliveryMap[o.id];
          const driverName = info?.driver?.full_name || null;
          const isDelivery = o.orderType === 'delivery';
          const isNew = o.estado === 'pendiente';
          const canSearch = isDelivery && (!info?.driverId || isNew);

          return (
            <tr key={o.id} className={`admin-orders-row border-t hover:bg-gray-50 ${isNew ? 'bg-amber-50/40' : ''}`}>
              <td className="p-2 font-mono text-[11px] font-semibold sm:p-2.5 sm:text-xs">{o.codigo_pedido || o.ticketNumber}</td>
              <td className="admin-col-branch hidden p-2 text-xs xl:table-cell sm:p-2.5">{branchFor(o).name}</td>
              <td className="max-w-[7rem] truncate p-2 sm:max-w-[10rem] sm:p-2.5 md:max-w-none">{o.customer?.name}</td>
              <td className="admin-col-phone hidden whitespace-nowrap p-2 text-xs sm:table-cell sm:p-2.5">{o.customer?.phone}</td>
              <td className="whitespace-nowrap p-2 text-xs font-semibold sm:p-2.5 sm:text-sm">{money(o.total)}</td>
              <td className="p-2 sm:p-2.5"><Badge estado={o.estado}>{estadoLabel(o.estado)}</Badge></td>
              <td className="p-2 sm:p-2.5">
                {driverName ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800">
                    <Truck className="h-3 w-3" />
                    {driverName}
                  </span>
                ) : isDelivery ? (
                  <span className="text-xs text-gray-400">N/A</span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </td>
              <td className="admin-col-caja p-2 sm:p-2.5">
                <CajaPagoControl
                  order={o}
                  disabled={Boolean(cajaBusy[o.id])}
                  onChange={(next) => changeCajaPago(o, next)}
                />
              </td>
              <td className="admin-col-date hidden whitespace-nowrap p-2 text-[11px] text-gray-600 md:table-cell sm:p-2.5">
                {formatDateTime(o.createdAt).split(',')[1]?.trim() || formatDateTime(o.createdAt)}
              </td>
              <td className="p-1.5 sm:p-2">
                <div className="admin-orders-actions flex items-center gap-0.5 sm:gap-1">
                  <button type="button" onClick={() => setViewOrder(o)} className="admin-orders-action admin-orders-action--view" title="Ver pedido">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="admin-orders-action__label">Ver</span>
                  </button>
                  <button type="button" onClick={() => handlePrint(o)} className="admin-orders-action admin-orders-action--print" title="Imprimir">
                    <Printer className="h-3.5 w-3.5" />
                    <span className="admin-orders-action__label">Imprimir</span>
                  </button>
                  {canSearch && (
                    <button
                      type="button"
                      onClick={() => handleSearchDriver(o)}
                      disabled={searchingDriver[o.id]}
                      className="admin-orders-action admin-orders-action--search text-pollon-orange disabled:opacity-50"
                      title="Buscar repartidor disponible"
                    >
                      <Search className={`h-3.5 w-3.5 ${searchingDriver[o.id] ? 'animate-spin' : ''}`} />
                      <span className="admin-orders-action__label">
                        {searchingDriver[o.id] ? 'Buscando…' : 'Repartidor'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => changeEstado(o)}
                    disabled={!canAdvanceOrderEstado(o.estado)}
                    className="admin-orders-action admin-orders-action--status disabled:cursor-not-allowed disabled:opacity-40"
                    title={canAdvanceOrderEstado(o.estado) ? `Avanzar a ${estadoLabel(getNextOrderEstado(o.estado))}` : 'Pedido finalizado'}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="admin-orders-action__label">Estado</span>
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </AdminTable>

      {viewOrder && (
        <OrderDetailModal
          order={viewOrder}
          branch={branchFor(viewOrder)}
          onClose={() => setViewOrder(null)}
          onChangeEstado={changeEstado}
          onCancelOrder={cancelOrder}
          cajaPagoSlot={(
            <CajaPagoControl
              order={viewOrder}
              disabled={Boolean(cajaBusy[viewOrder.id])}
              onChange={(next) => changeCajaPago(viewOrder, next)}
            />
          )}
        />
      )}
    </div>
  );
}
