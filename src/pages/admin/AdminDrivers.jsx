import { useEffect, useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import {
  listDrivers,
  updateDriverAdminStatus,
  updateDriverProfile,
  updateDriverMaxOrders,
} from '../../services/driverService';
import { adminListAllBranches } from '../../services/branchService';
import { Loader } from '../../components/ui/Loader';
import { Button } from '../../components/ui/Button';

const STATUS_LABELS = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobado', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendido', cls: 'bg-orange-100 text-orange-800' },
  blocked: { label: 'Bloqueado', cls: 'bg-red-100 text-red-800' },
};

const MAX_ORDER_OPTIONS = [2, 3, 4];

function normalizeMaxOrders(value) {
  const n = Number(value);
  if (MAX_ORDER_OPTIONS.includes(n)) return n;
  return 2;
}

export function AdminDrivers() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches: filterBranches,
    isSuperAdmin,
    showBranchFilter,
    branchId: staffBranchId,
  } = useAdminBranchFilter();
  const [drivers, setDrivers] = useState([]);
  const [allBranches, setAllBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busyId, setBusyId] = useState(null);

  const filterId = isSuperAdmin ? selectedBranchId || null : staffBranchId;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, br] = await Promise.all([
        listDrivers({ branchId: filterId }),
        adminListAllBranches().catch(() => filterBranches),
      ]);
      setDrivers(data);
      setAllBranches(br?.length ? br : filterBranches);
    } catch (err) {
      setError(err.message || 'Error al cargar repartidores. ¿Ejecutaste migration-repartidores-delivery.sql?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterId]);

  const setStatus = async (id, status) => {
    setBusyId(id);
    setFlash('');
    try {
      await updateDriverAdminStatus(id, status);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setBranch = async (id, preferredBranchId) => {
    setBusyId(id);
    setFlash('');
    try {
      await updateDriverProfile(id, { preferred_branch_id: preferredBranchId || null });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setMaxOrders = async (id, maxOrders) => {
    const next = normalizeMaxOrders(maxOrders);
    const prev = drivers.find((d) => d.id === id);
    if (prev && normalizeMaxOrders(prev.max_orders) === next) return;

    setBusyId(id);
    setError('');
    setFlash('');
    // Optimistic UI
    setDrivers((list) => list.map((d) => (d.id === id ? { ...d, max_orders: next } : d)));
    try {
      await updateDriverMaxOrders(id, next);
      setFlash(`Cupo actualizado: máximo ${next} pedido${next === 1 ? '' : 's'} simultáneos.`);
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Repartidores"
        subtitle="Aprueba, suspende, asigna sucursal y define cuántos pedidos puede llevar cada uno en ruta al local."
        actions={showBranchFilter ? (
          <AdminBranchFilter value={selectedBranchId} onChange={setSelectedBranchId} branches={filterBranches} />
        ) : null}
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Cómo funciona el cupo máximo</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs sm:text-sm">
          <li>Mientras va a la sucursal (pedidos aún no recogidos), puede aceptar hasta su máximo (2, 3 o 4).</li>
          <li>En cuanto marca <strong>pedido recogido</strong>, ya no recibe ofertas nuevas.</li>
          <li>Solo cuando entrega <strong>todos</strong> sus pedidos activos vuelve a recibir ofertas.</li>
        </ul>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {flash && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{flash}</div>}

      {loading ? (
        <Loader text="Cargando repartidores…" />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Repartidor</th>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Operativo</th>
                  <th className="px-4 py-3">
                    Máx. pedidos
                    <span className="mt-0.5 block font-normal normal-case text-[11px] text-gray-400">
                      Cupo simultáneo
                    </span>
                  </th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const st = STATUS_LABELS[d.admin_status] || STATUS_LABELS.pending;
                  const name = d.profiles?.full_name || d.profiles?.email || 'Sin nombre';
                  const maxOrders = normalizeMaxOrders(d.max_orders);
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{name}</p>
                        <p className="text-xs text-gray-500">{d.profiles?.email || d.phone}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {(d.vehicle_type || '').replace('_', ' ')} {d.vehicle_plate && `· ${d.vehicle_plate}`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600">{d.operational_status}</td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                          value={maxOrders}
                          disabled={busyId === d.id}
                          aria-label={`Máximo de pedidos para ${name}`}
                          title="Cantidad máxima de pedidos que puede aceptar antes del recojo"
                          onChange={(e) => setMaxOrders(d.id, e.target.value)}
                        >
                          {MAX_ORDER_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n} pedido{n === 1 ? '' : 's'}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-gray-400">2 · 3 · 4</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border px-2 py-1 text-xs"
                          value={d.preferred_branch_id || ''}
                          disabled={busyId === d.id}
                          onChange={(e) => setBranch(d.id, e.target.value)}
                        >
                          <option value="">Sin preferencia</option>
                          {allBranches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name || b.nombre}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {d.admin_status !== 'approved' && (
                            <Button className="!px-3 !py-1.5 text-xs" disabled={busyId === d.id} onClick={() => setStatus(d.id, 'approved')}>Aprobar</Button>
                          )}
                          {d.admin_status === 'approved' && (
                            <Button variant="outline" className="!px-3 !py-1.5 text-xs" disabled={busyId === d.id} onClick={() => setStatus(d.id, 'suspended')}>Suspender</Button>
                          )}
                          {d.admin_status !== 'rejected' && (
                            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={busyId === d.id} onClick={() => setStatus(d.id, 'rejected')}>Rechazar</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      No hay repartidores. En Supabase Auth crea el usuario y en <code>profiles.role</code> pon <strong>delivery</strong>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
