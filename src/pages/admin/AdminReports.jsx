import { useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { money, todayISO } from '../../utils/format';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';

export function AdminReports() {
  const { orders } = useOrders();
  const {
    applyBranchFilter,
    headerBranchLabel,
    isBranchScoped,
    showBranchFilter,
    branches,
    selectedBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter();
  const ordersScoped = useMemo(() => applyBranchFilter(orders), [orders, applyBranchFilter]);
  const today = todayISO();

  const report = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const diario = ordersScoped.filter((o) => (o.createdAt || '').startsWith(today));
    const semanal = ordersScoped.filter((o) => (o.createdAt || '') >= weekAgo);
    const mensual = ordersScoped.filter((o) => (o.createdAt || '') >= monthAgo);

    const sum = (list) => list.reduce((s, o) => s + (o.total || 0), 0);
    const avg = (list) => (list.length ? sum(list) / list.length : 0);

    const byHour = {};
    ordersScoped.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    });
    const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

    return {
      diario: { count: diario.length, total: sum(diario), ticket: avg(diario) },
      semanal: { count: semanal.length, total: sum(semanal) },
      mensual: { count: mensual.length, total: sum(mensual) },
      peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} pedidos)` : '—',
    };
  }, [ordersScoped, today]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Reportes"
        branchLabel={isBranchScoped || selectedBranchId ? headerBranchLabel : undefined}
        actions={showBranchFilter ? (
          <AdminBranchFilter
            branches={branches}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
          />
        ) : undefined}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-pollon-red">Hoy</h3>
          <p className="mt-2 text-2xl font-bold">{report.diario.count} pedidos</p>
          <p>{money(report.diario.total)}</p>
          <p className="text-sm text-gray-500">Ticket prom: {money(report.diario.ticket)}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-semibold">Semana</h3>
          <p className="mt-2 text-2xl font-bold">{report.semanal.count} pedidos</p>
          <p>{money(report.semanal.total)}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-semibold">Mes</h3>
          <p className="mt-2 text-2xl font-bold">{report.mensual.count} pedidos</p>
          <p>{money(report.mensual.total)}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p><strong>Horario pico:</strong> {report.peakHour}</p>
      </div>
    </div>
  );
}
