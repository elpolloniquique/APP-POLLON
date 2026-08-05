import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Eye,
  Printer,
  RefreshCw,
  Search,
  Volume2,
  VolumeX,
  Phone,
} from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { money, formatDateTime, estadoLabel, todayISO } from '../../utils/format';
import { printThermalReceiptSmart } from '../../utils/networkPrinter';
import { adminListAllBranches } from '../../services/branchService';
import { OrderDetailModal } from '../../components/admin/OrderDetailModal';
import { CajaPagoControl } from '../../components/admin/CajaPagoControl';
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
import '../../styles/orders-panel.css';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function orderMoneyParts(order) {
  const total = Number(order.total) || 0;
  const deliveryRaw = Number(order.deliveryFee) || 0;
  const delivery = order.orderType === 'delivery' ? deliveryRaw : 0;
  const subtotal = Math.max(0, total - delivery);
  return { subtotal, delivery, total };
}

function orderHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

function formatOrderTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return formatDateTime(iso);
  }
}

function statusBadgeClass(estado) {
  if (estado === 'pendiente') return 'orders-panel__badge--nuevo';
  if (estado === 'aceptado' || estado === 'confirmado') return 'orders-panel__badge--aceptado';
  if (estado === 'en_delivery' || estado === 'listo' || estado === 'preparando') {
    return 'orders-panel__badge--reparto';
  }
  if (estado === 'entregado') return 'orders-panel__badge--entregado';
  if (estado === 'cancelado') return 'orders-panel__badge--cancelado';
  return 'orders-panel__badge--otro';
}

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
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const [horaInicial, setHoraInicial] = useState('');
  const [horaFinal, setHoraFinal] = useState('');
  const [desde, setDesde] = useState(() => todayISO());
  const [hasta, setHasta] = useState(() => todayISO());
  const [viewOrder, setViewOrder] = useState(null);
  const [branches, setBranches] = useState([]);
  const [cajaBusy, setCajaBusy] = useState({});

  const [deliveryMap, setDeliveryMap] = useState({});
  const [driverNames, setDriverNames] = useState([]);
  const [searchingDriver, setSearchingDriver] = useState({});
  const autoDispatchedRef = useRef(new Set());

  const today = todayISO();
  const showingTodayOnly = desde === today && hasta === today;

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

  useEffect(() => {
    if (!ready) return;
    const deliveryOrders = ordersScoped.filter(
      (o) => o.orderType === 'delivery' && o.estado === 'pendiente' && !autoDispatchedRef.current.has(o.id),
    );
    for (const o of deliveryOrders) {
      autoDispatchedRef.current.add(o.id);
      autoDispatchNewOrder(o.id).then(() => {
        setTimeout(refreshDelivery, 1500);
      });
    }
  }, [ordersScoped, ready, refreshDelivery]);

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

  useEffect(() => {
    for (const o of ordersScoped) {
      const info = deliveryMap[o.id];
      if (!info) continue;
      if (o.estado === 'pendiente' && info.jobStatus === 'assigned' && info.driverId) {
        const updated = { ...o, estado: 'aceptado' };
        updateOrder(updated).then(refresh);
      }
    }
  }, [deliveryMap, ordersScoped, updateOrder, refresh]);

  const todayCount = useMemo(
    () => ordersScoped.filter((o) => (o.createdAt || '').substring(0, 10) === today).length,
    [ordersScoped, today],
  );

  const filtered = useMemo(() => ordersScoped.filter((o) => {
    const d = (o.createdAt || '').substring(0, 10);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    if (estado && o.estado !== estado) return false;
    if (orderTypeFilter && (o.orderType || 'delivery') !== orderTypeFilter) return false;
    if (horaInicial !== '' || horaFinal !== '') {
      const h = orderHour(o.createdAt);
      if (h == null) return false;
      if (horaInicial !== '' && h < Number(horaInicial)) return false;
      if (horaFinal !== '' && h > Number(horaFinal)) return false;
    }
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
      } else if (info?.driverId !== driverFilter) {
        return false;
      }
    }
    if (cajaPagoFilter) {
      const st = resolveCajaPagoStatus(o);
      if (st !== cajaPagoFilter) return false;
    }
    return true;
  }), [
    ordersScoped,
    estado,
    search,
    desde,
    hasta,
    driverFilter,
    cajaPagoFilter,
    deliveryMap,
    orderTypeFilter,
    horaInicial,
    horaFinal,
  ]);

  const totals = useMemo(() => filtered.reduce(
    (acc, o) => {
      const parts = orderMoneyParts(o);
      acc.subtotal += parts.subtotal;
      acc.delivery += parts.delivery;
      acc.total += parts.total;
      return acc;
    },
    { subtotal: 0, delivery: 0, total: 0 },
  ), [filtered]);

  const exportCsv = () => {
    const rows = [[
      'Código',
      'Sucursal',
      'Cliente',
      'Teléfono',
      'Subtotal',
      'Delivery',
      'Total',
      'Estado',
      'Repartidor',
      'Cobro caja',
      'Fecha',
    ]];
    filtered.forEach((o) => {
      const info = deliveryMap[o.id];
      const parts = orderMoneyParts(o);
      rows.push([
        o.codigo_pedido || o.ticketNumber,
        branchFor(o).name,
        o.customer?.name,
        o.customer?.phone,
        parts.subtotal,
        parts.delivery,
        parts.total,
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

  const handleRefreshAll = () => {
    clearDeliveryCache();
    refresh();
    refreshDelivery();
  };

  const liveOk = ready && isBackendReady && realtimeStatus === 'live';

  return (
    <div className="orders-panel">
      <div className="orders-panel__top">
        <div className="orders-panel__title-wrap">
          <p className="orders-panel__eyebrow">Administración</p>
          <h1 className="orders-panel__title">Pedidos</h1>
          <div className="orders-panel__live">
            {liveOk ? (
              <>
                <span className="orders-panel__live-dot" aria-hidden />
                Pedidos en tiempo real
              </>
            ) : ready && !isBackendReady ? (
              <span style={{ color: '#b45309' }}>Modo local</span>
            ) : (
              <>
                <span className="orders-panel__live-dot" style={{ background: '#9ca3af', boxShadow: 'none', animation: 'none' }} aria-hidden />
                Conectando…
              </>
            )}
            {(isBranchScoped || selectedBranchId) && headerBranchLabel ? (
              <span style={{ color: '#6b7280', fontWeight: 600 }}> · {headerBranchLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="orders-panel__actions">
          <button
            type="button"
            className={`orders-panel__btn ${alarmOn ? 'orders-panel__btn--alarm-on' : 'orders-panel__btn--alarm-off'}`}
            onClick={() => setAlarmOn(!alarmOn)}
            title={alarmOn ? 'Desactivar alarma de pedidos nuevos' : 'Activar alarma'}
          >
            {alarmOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {alarmOn ? 'Alarma ON' : 'Alarma OFF'}
          </button>
          <button
            type="button"
            className="orders-panel__btn orders-panel__btn--primary"
            onClick={handleRefreshAll}
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          <button type="button" className="orders-panel__btn" onClick={exportCsv} title="Exportar CSV">
            CSV
          </button>
          {showBranchFilter && (
            <label className="orders-panel__branch">
              <span>Sucursal</span>
              <select
                value={selectedBranchId || ''}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                <option value="">Todas las sucursales</option>
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="orders-panel__filters">
        <label className="orders-panel__field">
          <span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="orders-panel__field">
          <span>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>

        <button
          type="button"
          className={`orders-panel__today ${showingTodayOnly ? 'is-active' : ''}`}
          onClick={resetToToday}
          title="Ver pedidos de hoy"
        >
          <span>Hoy</span>
          <strong>{todayCount}</strong>
        </button>

        <label className="orders-panel__field">
          <span>Hora inicial</span>
          <select value={horaInicial} onChange={(e) => setHoraInicial(e.target.value)}>
            <option value="">Todas</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={`hi-${h}`} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
            ))}
          </select>
        </label>
        <label className="orders-panel__field">
          <span>Hora final</span>
          <select value={horaFinal} onChange={(e) => setHoraFinal(e.target.value)}>
            <option value="">Todas</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={`hf-${h}`} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
            ))}
          </select>
        </label>

        <label className="orders-panel__field">
          <span>Estaciones</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todas las estaciones</option>
            {ORDER_STATES.map((s) => (
              <option key={s} value={s}>{estadoLabel(s)}</option>
            ))}
          </select>
        </label>

        <label className="orders-panel__field">
          <span>Repartidores</span>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
            <option value="">Todos los repartidores</option>
            <option value="__none">Sin repartidor (N/A)</option>
            {driverNames.map((d) => (
              <option key={d.driverId} value={d.driverId}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="orders-panel__field">
          <span>Cocina asig.</span>
          <select value={orderTypeFilter} onChange={(e) => setOrderTypeFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="delivery">Delivery</option>
            <option value="retiro">Retiro</option>
            <option value="reserva">Reserva</option>
          </select>
        </label>

        <label className="orders-panel__field">
          <span>Cobro caja</span>
          <select value={cajaPagoFilter} onChange={(e) => setCajaPagoFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="na">N/A</option>
            <option value="por_pagar">Por pagar</option>
            <option value="pagado">Pagado</option>
          </select>
        </label>

        <label className="orders-panel__field orders-panel__field--search">
          <span>Buscar</span>
          <div className="orders-panel__search">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar por código, cliente o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
      </div>

      <div className="orders-panel__shell">
        <div className="orders-panel__scroll">
          <table className="orders-panel__table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Sucursal</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th className="is-num">Subtotal</th>
                <th className="is-num">Delivery</th>
                <th className="is-num">Total</th>
                <th>Estado</th>
                <th>Repartidor</th>
                <th>Cobro</th>
                <th>Hora</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="orders-panel__empty">Sin pedidos con estos filtros</td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const info = deliveryMap[o.id];
                  const driverName = info?.driver?.full_name || null;
                  const isDelivery = o.orderType === 'delivery';
                  const isNew = o.estado === 'pendiente';
                  const canSearch = isDelivery && (!info?.driverId || isNew);
                  const parts = orderMoneyParts(o);
                  const phone = o.customer?.phone || '';

                  return (
                    <tr key={o.id} className={isNew ? 'is-new' : ''}>
                      <td className="is-code">{o.codigo_pedido || o.ticketNumber}</td>
                      <td>{branchFor(o).name}</td>
                      <td>{o.customer?.name || '—'}</td>
                      <td>
                        {phone ? (
                          <a className="orders-panel__phone" href={`tel:${phone}`}>
                            <Phone className="h-3.5 w-3.5" />
                            {phone}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="is-num">{money(parts.subtotal)}</td>
                      <td className="is-num">{money(parts.delivery)}</td>
                      <td className="is-num is-strong">{money(parts.total)}</td>
                      <td className="is-center">
                        <span className={`orders-panel__badge ${statusBadgeClass(o.estado)}`}>
                          {estadoLabel(o.estado)}
                        </span>
                      </td>
                      <td>
                        {driverName || (isDelivery ? 'N/A' : '—')}
                      </td>
                      <td>
                        <CajaPagoControl
                          order={o}
                          disabled={Boolean(cajaBusy[o.id])}
                          onChange={(next) => changeCajaPago(o, next)}
                        />
                      </td>
                      <td>{formatOrderTime(o.createdAt)}</td>
                      <td>
                        <div className="orders-panel__actions-cell">
                          <button
                            type="button"
                            className="orders-panel__icon-btn"
                            onClick={() => setViewOrder(o)}
                            title="Ver pedido"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="orders-panel__icon-label">Ver</span>
                          </button>
                          <button
                            type="button"
                            className="orders-panel__icon-btn orders-panel__icon-btn--print"
                            onClick={() => handlePrint(o)}
                            title="Imprimir"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="orders-panel__icon-btn orders-panel__icon-btn--status"
                            onClick={() => changeEstado(o)}
                            disabled={!canAdvanceOrderEstado(o.estado)}
                            title={
                              canAdvanceOrderEstado(o.estado)
                                ? `Avanzar a ${estadoLabel(getNextOrderEstado(o.estado))}`
                                : 'Pedido finalizado'
                            }
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          {canSearch && (
                            <button
                              type="button"
                              className="orders-panel__icon-btn orders-panel__icon-btn--reassign"
                              onClick={() => handleSearchDriver(o)}
                              disabled={searchingDriver[o.id]}
                              title="Buscar / reasignar repartidor"
                            >
                              <Search className={`h-3.5 w-3.5 ${searchingDriver[o.id] ? 'animate-spin' : ''}`} />
                              <span className="orders-panel__icon-label">
                                {searchingDriver[o.id] ? '…' : 'Reasignar'}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="orders-panel__tfoot">
                <td colSpan={4} className="orders-panel__footer-label">TOTAL</td>
                <td className="is-num">{money(totals.subtotal)}</td>
                <td className="is-num">{money(totals.delivery)}</td>
                <td className="is-num">{money(totals.total)}</td>
                <td colSpan={5} className="orders-panel__footer-meta">
                  {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

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
