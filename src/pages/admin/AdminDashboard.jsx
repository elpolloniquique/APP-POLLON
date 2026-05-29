import { useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { money, todayISO } from '../../utils/format';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Title, Tooltip, Legend);

const chartOpts = { responsive: true, maintainAspectRatio: true };

export function AdminDashboard() {
  const { orders } = useOrders();
  const { filterOrders, branchName, isBranchScoped } = useStaffBranch();
  const ordersScoped = useMemo(() => filterOrders(orders), [orders, filterOrders]);

  const stats = useMemo(() => {
    const today = todayISO();
    const pedidosHoy = ordersScoped.filter((o) => (o.createdAt || '').startsWith(today));
    const ventasHoy = pedidosHoy.reduce((s, o) => s + (o.total || 0), 0);
    const pendientes = ordersScoped.filter((o) => ['pendiente', 'confirmado', 'preparando'].includes(o.estado)).length;
    const ticket = ordersScoped.length ? ordersScoped.reduce((s, o) => s + o.total, 0) / ordersScoped.length : 0;
    return { hoy: pedidosHoy.length, ventasHoy, pendientes, total: ordersScoped.length, ticket };
  }, [ordersScoped]);

  const lineData = useMemo(() => {
    const days = [];
    const sales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString('es-CL', { weekday: 'short' }));
      sales.push(ordersScoped.filter((o) => (o.createdAt || '').startsWith(key)).reduce((s, o) => s + o.total, 0));
    }
    return { labels: days, datasets: [{ label: 'Ventas CLP', data: sales, borderColor: '#c41e1e', backgroundColor: '#c41e1e33', tension: 0.3 }] };
  }, [ordersScoped]);

  const estadoData = useMemo(() => {
    const est = {};
    ordersScoped.forEach((o) => { est[o.estado || 'pendiente'] = (est[o.estado || 'pendiente'] || 0) + 1; });
    return {
      labels: Object.keys(est),
      datasets: [{ data: Object.values(est), backgroundColor: ['#f59e0b', '#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#22c55e', '#ef4444'] }],
    };
  }, [ordersScoped]);

  const topProducts = useMemo(() => {
    const count = {};
    ordersScoped.forEach((o) => (o.items || []).forEach((it) => { count[it.name] = (count[it.name] || 0) + (it.qty || 1); }));
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { labels: top.map((t) => t[0].slice(0, 20)), datasets: [{ label: 'Unidades', data: top.map((t) => t[1]), backgroundColor: '#c41e1e' }] };
  }, [ordersScoped]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        branchLabel={isBranchScoped ? branchName : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {[
          ['Pedidos hoy', stats.hoy],
          ['Ventas hoy', money(stats.ventasHoy)],
          ['Pendientes', stats.pendientes],
          ['Total pedidos', stats.total],
          ['Ticket promedio', money(stats.ticket)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:rounded-2xl sm:p-5">
            <p className="text-xs text-gray-500 sm:text-sm">{label}</p>
            <p className="mt-1 text-xl font-bold text-pollon-red sm:text-2xl">{val}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="min-h-[220px] rounded-xl bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
          <h3 className="mb-3 text-sm font-semibold sm:mb-4">Ventas 7 días</h3>
          <Line data={lineData} options={{ ...chartOpts, plugins: { legend: { display: false } } }} />
        </div>
        <div className="min-h-[220px] rounded-xl bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
          <h3 className="mb-3 text-sm font-semibold sm:mb-4">Por estado</h3>
          <Doughnut data={estadoData} options={chartOpts} />
        </div>
      </div>
      <div className="min-h-[240px] rounded-xl bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
        <h3 className="mb-3 text-sm font-semibold sm:mb-4">Productos más vendidos</h3>
        <Bar data={topProducts} options={{ ...chartOpts, plugins: { legend: { display: false } } }} />
      </div>
    </div>
  );
}
