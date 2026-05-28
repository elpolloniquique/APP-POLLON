import { useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Title, Tooltip, Legend);

export function AdminDashboard() {
  const { orders } = useOrders();

  const stats = useMemo(() => {
    const today = todayISO();
    const pedidosHoy = orders.filter((o) => (o.createdAt || '').startsWith(today));
    const ventasHoy = pedidosHoy.reduce((s, o) => s + (o.total || 0), 0);
    const pendientes = orders.filter((o) => ['pendiente', 'confirmado', 'preparando'].includes(o.estado)).length;
    const ticket = orders.length ? orders.reduce((s, o) => s + o.total, 0) / orders.length : 0;
    return { hoy: pedidosHoy.length, ventasHoy, pendientes, total: orders.length, ticket };
  }, [orders]);

  const lineData = useMemo(() => {
    const days = [];
    const sales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString('es-CL', { weekday: 'short' }));
      sales.push(orders.filter((o) => (o.createdAt || '').startsWith(key)).reduce((s, o) => s + o.total, 0));
    }
    return { labels: days, datasets: [{ label: 'Ventas CLP', data: sales, borderColor: '#c41e1e', backgroundColor: '#c41e1e33', tension: 0.3 }] };
  }, [orders]);

  const estadoData = useMemo(() => {
    const est = {};
    orders.forEach((o) => { est[o.estado || 'pendiente'] = (est[o.estado || 'pendiente'] || 0) + 1; });
    return {
      labels: Object.keys(est),
      datasets: [{ data: Object.values(est), backgroundColor: ['#f59e0b', '#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#22c55e', '#ef4444'] }],
    };
  }, [orders]);

  const topProducts = useMemo(() => {
    const count = {};
    orders.forEach((o) => (o.items || []).forEach((it) => { count[it.name] = (count[it.name] || 0) + (it.qty || 1); }));
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { labels: top.map((t) => t[0].slice(0, 20)), datasets: [{ label: 'Unidades', data: top.map((t) => t[1]), backgroundColor: '#c41e1e' }] };
  }, [orders]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Pedidos hoy', stats.hoy],
          ['Ventas hoy', money(stats.ventasHoy)],
          ['Pendientes', stats.pendientes],
          ['Total pedidos', stats.total],
          ['Ticket promedio', money(stats.ticket)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-pollon-red">{val}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold">Ventas 7 días</h3><Line data={lineData} options={{ responsive: true, plugins: { legend: { display: false } } }} /></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold">Por estado</h3><Doughnut data={estadoData} /></div>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold">Productos más vendidos</h3><Bar data={topProducts} options={{ responsive: true, plugins: { legend: { display: false } } }} /></div>
    </div>
  );
}
