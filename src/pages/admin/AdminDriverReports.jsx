import { useEffect, useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { getDispatchReport } from '../../services/trackingService';
import { listDrivers } from '../../services/driverService';
import { money } from '../../utils/format';
import { Loader } from '../../components/ui/Loader';

export function AdminDriverReports() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches,
    showBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();
  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;
  const [period, setPeriod] = useState('7d');
  const [report, setReport] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const days = period === 'today' ? 1 : period === '30d' ? 30 : 7;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    Promise.all([
      getDispatchReport(filterBranch, from),
      listDrivers({ branchId: filterBranch }),
    ])
      .then(([r, d]) => {
        setReport(r);
        setDrivers(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filterBranch, period]);

  const cards = [
    { label: 'Entregados', value: report?.delivered ?? 0 },
    { label: 'Activos', value: report?.active ?? 0 },
    { label: 'Cancelados', value: report?.cancelled ?? 0 },
    { label: 'Fees delivery', value: money(report?.total_fees ?? 0) },
    { label: 'Min. promedio', value: report?.avg_delivery_minutes != null ? `${report.avg_delivery_minutes} min` : '—' },
    { label: 'Repartidores', value: drivers.filter((d) => d.admin_status === 'approved').length },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <AdminPageHeader
        title="Reporte de repartidores"
        subtitle="KPIs de despacho y flota"
        actions={(
          <div className="flex flex-wrap gap-2">
            {showBranchFilter && (
              <AdminBranchFilter value={selectedBranchId} onChange={setSelectedBranchId} branches={branches} />
            )}
            <div className="flex rounded-xl border bg-white p-0.5">
              {[
                { id: 'today', label: 'Hoy' },
                { id: '7d', label: '7 días' },
                { id: '30d', label: '30 días' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${period === p.id ? 'bg-pollon-red text-white' : 'text-gray-600'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? <Loader /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border bg-white p-4">
                <p className="text-xs font-medium uppercase text-gray-400">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-pollon-black">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <h3 className="mb-3 font-bold">Flota</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Admin</th>
                    <th className="px-3 py-2">Operativo</th>
                    <th className="px-3 py-2">Capacidad</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{d.profiles?.full_name || d.profiles?.email}</td>
                      <td className="px-3 py-2 capitalize">{d.admin_status}</td>
                      <td className="px-3 py-2 capitalize">{d.operational_status}</td>
                      <td className="px-3 py-2">{d.max_orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
