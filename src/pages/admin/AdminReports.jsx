import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  Clock,
  Columns3,
  Download,
  FileText,
  Filter,
  Hash,
  Package,
  Receipt,
  Search,
  ShoppingBag,
  Tag,
  Bird,
} from 'lucide-react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

import { useOrders } from '../../hooks/useOrders';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { money } from '../../utils/format';
import {
  REPORT_PERIODS,
  CHICKEN_LEGEND,
  HOUR_OPTIONS,
  getReportRange,
  filterOrdersForReport,
  buildProductRows,
  buildProductReportKpis,
  buildChickenBreakdown,
  buildCategoryTimeline,
  buildTimeSlotChart,
  compareAvgPrice,
  formatReportStamp,
  formatShortDate,
  toInputDate,
  exportProductRowsCsv,
  printProductReportSummary,
} from '../../utils/productReportAnalytics';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import '../../styles/admin-product-report.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

const CHART_FONT = { size: 9 };
const GRID = 'rgba(0,0,0,0.04)';

const ALL_COLUMNS = [
  { id: 'idx', label: '#' },
  { id: 'name', label: 'Producto' },
  { id: 'category', label: 'Categoría' },
  { id: 'qty', label: 'Cantidad' },
  { id: 'sales', label: 'Monto total' },
  { id: 'chicken', label: 'Cant. pollo' },
  { id: 'part', label: '% Participación' },
  { id: 'avg', label: 'Precio prom.' },
];

function lineOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 8, font: CHART_FONT, padding: 6, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: '#0a0a0a',
        padding: 8,
        callbacks: {
          label(ctx) {
            return ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: CHART_FONT, maxRotation: 0 }, border: { display: false } },
      y: {
        grid: { color: GRID },
        border: { display: false },
        ticks: {
          font: CHART_FONT,
          maxTicksLimit: 4,
          callback: (v) => {
            const n = Number(v) || 0;
            if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
            return `$${n}`;
          },
        },
      },
    },
  };
}

function barOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0a0a0a',
        padding: 8,
        callbacks: {
          label(ctx) {
            const v = ctx.parsed.y;
            return ctx.dataset.label === 'Monto' ? ` ${money(v)}` : ` ${v}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: CHART_FONT }, border: { display: false } },
      y: { grid: { color: GRID }, ticks: { font: CHART_FONT, maxTicksLimit: 4 }, border: { display: false } },
    },
  };
}

function doughOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0a0a0a', padding: 8 } },
  };
}

export function AdminReports() {
  const { orders } = useOrders();
  const {
    applyBranchFilter,
    showBranchFilter,
    branches,
    selectedBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter();

  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState(() => toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));
  const [hourFrom, setHourFrom] = useState(0);
  const [hourTo, setHourTo] = useState(23);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [slotMode, setSlotMode] = useState('amount');
  const [showCols, setShowCols] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, true])));
  const [generatedAt] = useState(() => formatReportStamp());

  const ordersScoped = useMemo(() => applyBranchFilter(orders), [orders, applyBranchFilter]);

  const range = useMemo(
    () => getReportRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const filteredOrders = useMemo(
    () => filterOrdersForReport(ordersScoped, {
      start: range.start,
      end: range.end,
      hourFrom,
      hourTo,
    }),
    [ordersScoped, range, hourFrom, hourTo],
  );

  const prevOrders = useMemo(
    () => filterOrdersForReport(ordersScoped, {
      start: range.prevStart,
      end: range.prevEnd,
      hourFrom,
      hourTo,
    }),
    [ordersScoped, range, hourFrom, hourTo],
  );

  const analytics = useMemo(() => {
    const rowsRaw = buildProductRows(filteredOrders);
    const prevRows = buildProductRows(prevOrders);
    const rows = compareAvgPrice(rowsRaw, prevRows);
    const kpis = buildProductReportKpis(filteredOrders, rows);
    const chicken = buildChickenBreakdown(rows);
    const categories = [...new Set(rows.map((r) => r.category))].sort();
    return {
      rows,
      kpis,
      chicken,
      categories,
      categoryTimeline: buildCategoryTimeline(filteredOrders, period === 'custom' ? 'today' : period),
      timeSlots: buildTimeSlotChart(filteredOrders, slotMode),
    };
  }, [filteredOrders, prevOrders, period, slotMode]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analytics.rows.filter((r) => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [analytics.rows, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totals = useMemo(() => ({
    qty: filteredRows.reduce((s, r) => s + r.qty, 0),
    sales: filteredRows.reduce((s, r) => s + r.sales, 0),
    chicken: Math.round(filteredRows.reduce((s, r) => s + r.chicken, 0) * 100) / 100,
  }), [filteredRows]);

  const top5 = analytics.rows.slice(0, 5);
  const topColors = ['#c41e1e', '#f97316', '#22c55e', '#3b82f6', '#8b5cf6'];

  const activeCats = useMemo(
    () => new Set(analytics.rows.map((r) => r.category)).size,
    [analytics.rows],
  );

  function toggleCol(id) {
    setVisibleCols((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleExport() {
    exportProductRowsCsv(filteredRows, `reporte-productos-${Date.now()}.csv`);
  }

  function handleGenerate() {
    printProductReportSummary({
      title: 'Reporte de Productos — El Pollón',
      kpis: analytics.kpis,
      generatedAt: formatReportStamp(),
    });
  }

  const fromLabel = formatShortDate(range.start);
  const toLabel = formatShortDate(range.end);

  return (
    <div className="admin-product-report">
      {/* Header */}
      <header className="apr-header">
        <div className="apr-header__titles">
          <span className="apr-header__icon" aria-hidden>
            <BarChart3 className="h-4 w-4" />
          </span>
          <div>
            <h1 className="apr-header__title">Reporte de Productos</h1>
            <p className="apr-header__subtitle">Resumen detallado de ventas por producto</p>
          </div>
        </div>
        <div className="apr-header__actions">
          <button type="button" className="apr-btn apr-btn--ghost" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
          <button type="button" className="apr-btn apr-btn--primary" onClick={handleGenerate}>
            <FileText className="h-3.5 w-3.5" />
            Generar Reporte
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="apr-filters">
        <div className="apr-period-tabs" role="tablist">
          {REPORT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={`apr-period-tab ${period === p.id ? 'is-active' : ''}`}
              onClick={() => { setPeriod(p.id); setPage(1); }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="apr-filters__row">
          <label className="apr-field">
            <span>Desde</span>
            <div className="apr-field__control">
              <Calendar className="h-3.5 w-3.5 opacity-60" />
              <input
                type="date"
                value={period === 'custom' ? customFrom : toInputDate(range.start)}
                onChange={(e) => {
                  setPeriod('custom');
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className="apr-field">
            <span>Hasta</span>
            <div className="apr-field__control">
              <Calendar className="h-3.5 w-3.5 opacity-60" />
              <input
                type="date"
                value={period === 'custom' ? customTo : toInputDate(range.end)}
                onChange={(e) => {
                  setPeriod('custom');
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className="apr-field">
            <span>Hora inicial</span>
            <select value={hourFrom} onChange={(e) => { setHourFrom(Number(e.target.value)); setPage(1); }}>
              {HOUR_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </label>
          <label className="apr-field">
            <span>Hora final</span>
            <select value={hourTo} onChange={(e) => { setHourTo(Number(e.target.value)); setPage(1); }}>
              {HOUR_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
              <option value={23}>23:59</option>
            </select>
          </label>

          <label className="apr-search">
            <Search className="h-3.5 w-3.5 opacity-55" />
            <input
              type="search"
              placeholder="Buscar productos..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </label>

          {showBranchFilter && (
            <label className="apr-field apr-field--branch">
              <span>Sucursal</span>
              <AdminBranchFilter
                branches={branches}
                value={selectedBranchId}
                onChange={(v) => { setSelectedBranchId(v); setPage(1); }}
              />
            </label>
          )}
        </div>

        <div className="apr-legend">
          {CHICKEN_LEGEND.map((l) => (
            <span key={l.label} className="apr-legend__chip">
              {l.label} = {l.eq}
            </span>
          ))}
          <span className="apr-legend__range">{fromLabel} — {toLabel}</span>
        </div>
      </section>

      {/* KPIs */}
      <section className="apr-kpis">
        {[
          { label: 'Ventas Totales', value: money(analytics.kpis.sales), sub: 'Total en el periodo', icon: ShoppingBag, tone: 'red' },
          { label: 'Productos Vendidos', value: analytics.kpis.units, sub: 'Unidades totales', icon: Package, tone: 'orange' },
          { label: 'Cant. Pollos Vendidos', value: analytics.kpis.chickens, sub: 'Equivalente en pollos', icon: Bird, tone: 'amber' },
          { label: 'Ticket Promedio', value: money(analytics.kpis.ticket), sub: 'Por orden', icon: Receipt, tone: 'red' },
          { label: 'Órdenes Totales', value: analytics.kpis.orders, sub: 'Pedidos realizados', icon: Hash, tone: 'blue' },
          { label: 'Productos Únicos', value: analytics.kpis.unique, sub: 'Variedades vendidas', icon: Tag, tone: 'purple' },
        ].map((k) => (
          <div key={k.label} className={`apr-kpi apr-kpi--${k.tone}`}>
            <span className="apr-kpi__icon"><k.icon className="h-3.5 w-3.5" strokeWidth={2.25} /></span>
            <div className="min-w-0">
              <p className="apr-kpi__label">{k.label}</p>
              <p className="apr-kpi__value">{k.value}</p>
              <p className="apr-kpi__sub">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main grid */}
      <div className="apr-main">
        <section className="apr-table-card">
          <div className="apr-table-card__head">
            <h2>Detalle de Productos Vendidos</h2>
            <div className="apr-table-card__actions">
              <div className="apr-dropdown-wrap">
                <button type="button" className="apr-btn apr-btn--ghost apr-btn--sm" onClick={() => setShowCols((v) => !v)}>
                  <Columns3 className="h-3.5 w-3.5" />
                  Columnas
                </button>
                {showCols && (
                  <div className="apr-dropdown">
                    {ALL_COLUMNS.map((c) => (
                      <label key={c.id} className="apr-dropdown__item">
                        <input type="checkbox" checked={!!visibleCols[c.id]} onChange={() => toggleCol(c.id)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`apr-btn apr-btn--sm ${showAdv ? 'apr-btn--primary' : 'apr-btn--ghost'}`}
                onClick={() => setShowAdv((v) => !v)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filtros Avanzados
              </button>
            </div>
          </div>

          {showAdv && (
            <div className="apr-adv">
              <label className="apr-field">
                <span>Categoría</span>
                <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
                  <option value="">Todas</option>
                  {analytics.categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="apr-table-wrap">
            <table className="apr-table">
              <thead>
                <tr>
                  {visibleCols.idx && <th>#</th>}
                  {visibleCols.name && <th>Producto</th>}
                  {visibleCols.category && <th>Categoría</th>}
                  {visibleCols.qty && <th>Cantidad</th>}
                  {visibleCols.sales && <th>Monto total</th>}
                  {visibleCols.chicken && <th>Cant. pollo</th>}
                  {visibleCols.part && <th>% Participación</th>}
                  {visibleCols.avg && <th>Precio prom.</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={r.key}>
                    {visibleCols.idx && <td>{(safePage - 1) * pageSize + i + 1}</td>}
                    {visibleCols.name && <td className="apr-table__name" title={r.name}>{r.name}</td>}
                    {visibleCols.category && <td>{r.category}</td>}
                    {visibleCols.qty && <td>{r.qty}</td>}
                    {visibleCols.sales && <td className="apr-table__money">{money(r.sales)}</td>}
                    {visibleCols.chicken && <td>{r.chicken}</td>}
                    {visibleCols.part && (
                      <td>
                        <div className="apr-part">
                          <div className="apr-part__bar"><span style={{ width: `${Math.min(100, r.participation)}%` }} /></div>
                          <span>{r.participation}%</span>
                        </div>
                      </td>
                    )}
                    {visibleCols.avg && (
                      <td>
                        <span className="apr-avg">
                          {money(r.avgPrice)}
                          {r.priceTrend > 0 && <ArrowUp className="h-3 w-3 text-emerald-600" />}
                          {r.priceTrend < 0 && <ArrowDown className="h-3 w-3 text-red-600" />}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
                {!pageRows.length && (
                  <tr>
                    <td colSpan={8} className="apr-table__empty">Sin productos en el período</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  {visibleCols.idx && <td />}
                  {visibleCols.name && <td>TOTAL</td>}
                  {visibleCols.category && <td />}
                  {visibleCols.qty && <td>{totals.qty}</td>}
                  {visibleCols.sales && <td>{money(totals.sales)}</td>}
                  {visibleCols.chicken && <td>{totals.chicken}</td>}
                  {visibleCols.part && <td>100%</td>}
                  {visibleCols.avg && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="apr-pager">
            <span>
              Mostrando {(filteredRows.length ? (safePage - 1) * pageSize + 1 : 0)} a{' '}
              {Math.min(safePage * pageSize, filteredRows.length)} de {filteredRows.length} productos
            </span>
            <div className="apr-pager__right">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                aria-label="Por página"
              >
                {[5, 10, 15, 25].map((n) => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
              <div className="apr-pager__pages">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let n = i + 1;
                  if (totalPages > 5 && safePage > 3) n = safePage - 2 + i;
                  if (n > totalPages) return null;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={n === safePage ? 'is-active' : ''}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="apr-charts">
          <article className="apr-chart-card">
            <h3>Ventas por Categoría</h3>
            <div className="apr-chart-h">
              {analytics.categoryTimeline.datasets.length ? (
                <Line data={analytics.categoryTimeline} options={lineOpts()} />
              ) : (
                <p className="apr-empty">Sin datos</p>
              )}
            </div>
          </article>

          <article className="apr-chart-card">
            <div className="apr-chart-card__head">
              <h3>Ventas por Franja Horaria</h3>
              <select value={slotMode} onChange={(e) => setSlotMode(e.target.value)} className="apr-mini-select">
                <option value="amount">Mostrar: Monto</option>
                <option value="orders">Mostrar: Pedidos</option>
              </select>
            </div>
            <div className="apr-chart-h apr-chart-h--sm">
              <Bar data={analytics.timeSlots} options={barOpts()} />
            </div>
          </article>
        </aside>
      </div>

      {/* Bottom widgets */}
      <section className="apr-bottom">
        <article className="apr-widget apr-widget--chicken">
          <div className="apr-chicken">
            <div className="apr-chicken__info">
              <span className="apr-chicken__icon"><Bird className="h-6 w-6" /></span>
              <div>
                <h3>Equivalente en Pollos</h3>
                <p className="apr-chicken__total">{analytics.chicken.total} pollos</p>
                <ul>
                  {analytics.chicken.list.map((b) => (
                    <li key={b.label}>
                      <span style={{ background: b.color }} />
                      {b.label}: <strong>{Math.round(b.value * 100) / 100}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="apr-chicken__chart">
              {analytics.chicken.chart.labels?.length ? (
                <Doughnut data={analytics.chicken.chart} options={doughOpts()} />
              ) : null}
            </div>
          </div>
        </article>

        <article className="apr-widget">
          <h3>Top 5 Productos Más Vendidos</h3>
          <ol className="apr-top5">
            {top5.map((r, i) => (
              <li key={r.key}>
                <span className="apr-top5__rank">{i + 1}</span>
                <span className="apr-top5__name" title={r.name}>{r.name}</span>
                <span className="apr-top5__badge" style={{ background: topColors[i] }}>
                  {r.qty} uds
                </span>
              </li>
            ))}
            {!top5.length && <li className="apr-empty">Sin ventas</li>}
          </ol>
        </article>

        <article className="apr-widget">
          <h3>Estadísticas de Productos</h3>
          <div className="apr-stats">
            {[
              ['Productos únicos', analytics.kpis.unique, Tag],
              ['Variedades', analytics.kpis.unique, Package],
              ['Categorías activas', activeCats, Columns3],
              ['Unidades vendidas', analytics.kpis.units, ShoppingBag],
              ['Órdenes', analytics.kpis.orders, Hash],
              ['Pollos eq.', analytics.kpis.chickens, Bird],
            ].map(([label, val, Icon]) => (
              <div key={label} className="apr-stats__item">
                <Icon className="h-3.5 w-3.5 text-pollon-red" />
                <div>
                  <span>{label}</span>
                  <strong>{val}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer className="apr-footer">
        <p>Los valores mostrados incluyen todos los impuestos y descuentos aplicados en el periodo seleccionado.</p>
        <p className="apr-footer__stamp">
          <Clock className="h-3.5 w-3.5" />
          Reporte generado: {generatedAt}
        </p>
      </footer>
    </div>
  );
}
