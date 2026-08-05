import { useMemo, useState } from 'react';
import {
  BarChart3,
  Clock,
  DollarSign,
  Package,
  ShoppingBag,
  TrendingUp,
  Truck,
  XCircle,
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
  PERIOD_OPTIONS,
  buildBranchStats,
  buildHourlyChart,
  buildOrderTypeChart,
  buildPaymentChart,
  buildPipelineChart,
  buildStatusChart,
  buildTimeline,
  buildTopProducts,
  buildWeekdayChart,
  computeKPIs,
  filterOrdersInRange,
  getPeriodRange,
} from '../../utils/dashboardAnalytics';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { DashboardChartCard, DashboardKpiCard } from '../../components/admin/dashboard/DashboardChartCard';
import '../../styles/admin-dashboard.css';

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

const CHART_FONT = { size: 10 };
const GRID_COLOR = 'rgba(0,0,0,0.045)';

const baseScales = {
  x: {
    grid: { display: false, color: GRID_COLOR },
    ticks: { font: CHART_FONT, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    border: { display: false },
  },
  y: {
    grid: { color: GRID_COLOR },
    ticks: { font: CHART_FONT, maxTicksLimit: 5 },
    border: { display: false },
  },
};

function compactLineOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, font: CHART_FONT, padding: 10, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: '#0a0a0a',
        padding: 10,
        titleFont: { size: 11 },
        bodyFont: { size: 11 },
      },
    },
    scales: baseScales,
    ...extra,
  };
}

function evolutionLineOptions() {
  return compactLineOptions({
    scales: {
      x: baseScales.x,
      y: {
        ...baseScales.y,
        position: 'left',
        ticks: {
          ...baseScales.y.ticks,
          callback: (v) => {
            const n = Number(v) || 0;
            if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
            if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
            return `$${n}`;
          },
        },
        title: { display: false },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        border: { display: false },
        ticks: { font: CHART_FONT, maxTicksLimit: 5, precision: 0 },
        title: { display: false },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, font: CHART_FONT, padding: 8, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: '#0a0a0a',
        padding: 10,
        titleFont: { size: 11 },
        bodyFont: { size: 11 },
        callbacks: {
          label(ctx) {
            const label = ctx.dataset.label || '';
            const val = ctx.parsed.y;
            if (ctx.dataset.yAxisID === 'y1') return ` ${label}: ${val}`;
            return ` ${label}: ${money(val)}`;
          },
        },
      },
    },
  });
}

function compactDoughnutOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 8, font: CHART_FONT, padding: 8 },
      },
      tooltip: { backgroundColor: '#0a0a0a', padding: 10 },
    },
  };
}

function compactBarOptions(horizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0a0a0a', padding: 10 },
    },
    scales: horizontal
      ? {
          x: { ...baseScales.y, grid: { color: GRID_COLOR } },
          y: { ...baseScales.x, grid: { display: false } },
        }
      : baseScales,
  };
}

export function AdminDashboard() {
  const { orders } = useOrders();
  const [period, setPeriod] = useState('week');
  const {
    applyBranchFilter,
    headerBranchLabel,
    isBranchScoped,
    isSuperAdmin,
    showBranchFilter,
    branches,
    selectedBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter();

  const ordersScoped = useMemo(() => applyBranchFilter(orders), [orders, applyBranchFilter]);

  const analytics = useMemo(() => {
    const { start, end, prevStart, prevEnd } = getPeriodRange(period);
    const current = filterOrdersInRange(ordersScoped, start, end);
    const previous = filterOrdersInRange(ordersScoped, prevStart, prevEnd);
    const kpis = computeKPIs(current, previous);
    const timeline = buildTimeline(current, period);
    const branchStats = isSuperAdmin && !selectedBranchId
      ? buildBranchStats(ordersScoped, branches, period)
      : [];

    return {
      current,
      kpis,
      timeline,
      branchStats,
      status: buildStatusChart(current),
      payment: buildPaymentChart(current),
      orderType: buildOrderTypeChart(current),
      hourly: buildHourlyChart(current),
      weekday: buildWeekdayChart(current),
      topProducts: buildTopProducts(current, 6),
      pipeline: buildPipelineChart(current),
    };
  }, [ordersScoped, period, isSuperAdmin, selectedBranchId, branches]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.id === period)?.label || 'Período';

  const evolutionData = {
    labels: analytics.timeline.labels,
    datasets: [
      {
        label: 'Ventas productos',
        data: analytics.timeline.productSales,
        borderColor: '#c41e1e',
        backgroundColor: 'rgba(196,30,30,0.08)',
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2.25,
        yAxisID: 'y',
      },
      {
        label: 'Delivery',
        data: analytics.timeline.deliverySales,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.08)',
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID: 'y',
      },
      {
        label: 'Cantidad pedidos',
        data: analytics.timeline.orders,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: [5, 4],
        yAxisID: 'y1',
      },
    ],
  };

  const topProductsData = {
    labels: analytics.topProducts.labels,
    datasets: [{
      data: analytics.topProducts.data,
      backgroundColor: '#c41e1e',
      borderRadius: 4,
      maxBarThickness: 16,
    }],
  };

  const hourlyData = {
    labels: analytics.hourly.labels,
    datasets: [{
      label: 'Pedidos',
      data: analytics.hourly.orders,
      backgroundColor: 'rgba(192,0,0,0.75)',
      borderRadius: 3,
      maxBarThickness: 11,
    }],
  };

  const weekdayData = {
    labels: analytics.weekday.labels,
    datasets: [{
      label: 'Ventas',
      data: analytics.weekday.sales,
      backgroundColor: '#f97316',
      borderRadius: 4,
      maxBarThickness: 22,
    }],
  };

  const branchCompareData = analytics.branchStats.length ? {
    labels: analytics.branchStats.map((b) => (b.name.length > 16 ? `${b.name.slice(0, 16)}…` : b.name)),
    datasets: [{
      label: 'Ventas',
      data: analytics.branchStats.map((b) => b.sales),
      backgroundColor: '#c41e1e',
      borderRadius: 4,
      maxBarThickness: 18,
    }],
  } : null;

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__sticky">
        <AdminPageHeader
          title="Dashboard"
          subtitle={`Análisis ${periodLabel.toLowerCase()} · tiempo real`}
          branchLabel={isBranchScoped || selectedBranchId ? headerBranchLabel : undefined}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {showBranchFilter && (
                <AdminBranchFilter
                  branches={branches}
                  value={selectedBranchId}
                  onChange={setSelectedBranchId}
                />
              )}
            </div>
          )}
        />

        <div className="dashboard-toolbar">
          <div className="dashboard-period-tabs" role="tablist" aria-label="Período">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={period === opt.id}
                onClick={() => setPeriod(opt.id)}
                className={`dashboard-period-tab ${period === opt.id ? 'dashboard-period-tab--active' : ''}`}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="text-[10px] opacity-70">{opt.short}</span>
              </button>
            ))}
          </div>
          <p className="dashboard-toolbar__meta">
            <span className="dashboard-live-dot" aria-hidden />
            {analytics.current.length} pedido{analytics.current.length !== 1 ? 's' : ''} en el período
          </p>
        </div>

        <div className="dashboard-kpi-grid">
          <DashboardKpiCard
            label="Ventas totales"
            value={money(analytics.kpis.sales)}
            delta={analytics.kpis.salesDelta}
            icon={DollarSign}
          />
          <DashboardKpiCard
            label="Ventas productos"
            value={money(analytics.kpis.productSales)}
            delta={analytics.kpis.productSalesDelta}
            icon={Package}
          />
          <DashboardKpiCard
            label="Delivery (ingresos)"
            value={money(analytics.kpis.deliverySales)}
            delta={analytics.kpis.deliverySalesDelta}
            icon={Truck}
            accent="amber"
          />
          <DashboardKpiCard
            label="Pedidos"
            value={analytics.kpis.orders}
            delta={analytics.kpis.ordersDelta}
            icon={ShoppingBag}
            accent="amber"
          />
          <DashboardKpiCard
            label="Ticket promedio"
            value={money(analytics.kpis.ticket)}
            delta={analytics.kpis.ticketDelta}
            icon={TrendingUp}
          />
          <DashboardKpiCard
            label="Entregados"
            value={analytics.kpis.delivered}
            delta={analytics.kpis.deliveredDelta}
            icon={Package}
            accent="green"
          />
          <DashboardKpiCard
            label="Pendientes"
            value={analytics.kpis.pending}
            delta={analytics.kpis.pendingDelta}
            icon={Clock}
            accent="amber"
          />
          <DashboardKpiCard
            label="Tasa entrega"
            value={`${analytics.kpis.conversion}%`}
            icon={BarChart3}
          />
        </div>
      </div>

      <div className="admin-dashboard-scroll">
        {isSuperAdmin && !selectedBranchId && analytics.branchStats.length > 0 && (
          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Ranking por sucursal</h2>
            <div className="dashboard-branch-rank">
              {analytics.branchStats.slice(0, 6).map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBranchId(b.id)}
                  className="dashboard-branch-chip"
                >
                  <span className="dashboard-branch-chip__rank">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">{b.name}</span>
                  <span className="text-xs font-bold text-pollon-red">{money(b.sales)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Evolución de ventas</h2>
          <div className="dashboard-charts-grid dashboard-charts-grid--evolution">
            <DashboardChartCard
              title="Evolución de ventas"
              subtitle={`${periodLabel} · productos, delivery y cantidad de pedidos`}
              className="dashboard-chart-card--wide"
            >
              <div className="dashboard-chart-h dashboard-chart-h--lg">
                <Line data={evolutionData} options={evolutionLineOptions()} />
              </div>
            </DashboardChartCard>
          </div>
        </section>

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Distribución</h2>
          <div className="dashboard-charts-grid dashboard-charts-grid--3">
            <DashboardChartCard title="Estados" subtitle="Pipeline actual">
              <div className="dashboard-chart-h dashboard-chart-h--doughnut">
                <Doughnut data={analytics.status} options={compactDoughnutOptions()} />
              </div>
            </DashboardChartCard>
            <DashboardChartCard title="Método de pago">
              <div className="dashboard-chart-h dashboard-chart-h--doughnut">
                <Doughnut data={analytics.payment} options={compactDoughnutOptions()} />
              </div>
            </DashboardChartCard>
            <DashboardChartCard title="Tipo de pedido">
              <div className="dashboard-chart-h">
                <Bar data={analytics.orderType} options={compactBarOptions()} />
              </div>
            </DashboardChartCard>
          </div>
        </section>

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Horarios y productos</h2>
          <div className="dashboard-charts-grid dashboard-charts-grid--3">
            <DashboardChartCard title="Por hora" subtitle="Actividad del período">
              <div className="dashboard-chart-h dashboard-chart-h--sm">
                <Bar data={hourlyData} options={compactBarOptions()} />
              </div>
            </DashboardChartCard>
            <DashboardChartCard title="Por día semana">
              <div className="dashboard-chart-h dashboard-chart-h--sm">
                <Bar data={weekdayData} options={compactBarOptions()} />
              </div>
            </DashboardChartCard>
            <DashboardChartCard title="Top productos" subtitle="Unidades vendidas">
              <div className="dashboard-chart-h dashboard-chart-h--sm">
                <Bar data={topProductsData} options={compactBarOptions(true)} />
              </div>
            </DashboardChartCard>
          </div>
        </section>

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Operaciones</h2>
          <div className="dashboard-charts-grid">
            <DashboardChartCard title="Embudo de pedidos" subtitle="Por etapa del flujo">
              <div className="dashboard-chart-h dashboard-chart-h--sm">
                <Bar data={analytics.pipeline} options={compactBarOptions()} />
              </div>
            </DashboardChartCard>
            {branchCompareData && (
              <DashboardChartCard title="Comparativa sucursales" subtitle={`Ventas ${periodLabel.toLowerCase()}`}>
                <div className="dashboard-chart-h dashboard-chart-h--sm">
                  <Bar data={branchCompareData} options={compactBarOptions()} />
                </div>
              </DashboardChartCard>
            )}
            {!branchCompareData && (
              <DashboardChartCard title="Cancelados" subtitle="En el período">
                <div className="dashboard-cancel-stat">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <strong>{analytics.kpis.cancelled}</strong>
                  <span>pedidos cancelados</span>
                </div>
              </DashboardChartCard>
            )}
          </div>
        </section>

        <section className="dashboard-section dashboard-section--last">
          <h2 className="dashboard-section__title">Resumen rápido</h2>
          <div className="dashboard-summary-grid">
            {[
              ['Pedidos', analytics.kpis.orders],
              ['Ventas productos', money(analytics.kpis.productSales)],
              ['Delivery', money(analytics.kpis.deliverySales)],
              ['Ventas totales', money(analytics.kpis.sales)],
              ['Ticket promedio', money(analytics.kpis.ticket)],
              ['Tasa entrega', `${analytics.kpis.conversion}%`],
              ['Efectivo', money(analytics.current.filter((o) => o.metodo_pago === 'efectivo').reduce((s, o) => s + o.total, 0))],
              ['Transferencia', money(analytics.current.filter((o) => o.metodo_pago === 'transferencia').reduce((s, o) => s + o.total, 0))],
            ].map(([label, val]) => (
              <div key={label} className="dashboard-summary-item">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm font-bold text-pollon-black">{val}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
