import { useEffect, useState, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { listDeliveryJobs, startDriverSearch, upsertJobFromOrder, subscribeDispatch } from '../../services/dispatchService';
import { retryStaleDriverSearches } from '../../services/orderDeliveryService';
import { fetchOrdersAdmin } from '../../services/orderService';
import { money } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Loader } from '../../components/ui/Loader';

const STATUS_CLS = {
  ready_for_dispatch: 'bg-blue-100 text-blue-800',
  searching_driver: 'bg-amber-100 text-amber-800',
  offered: 'bg-orange-100 text-orange-800',
  assigned: 'bg-purple-100 text-purple-800',
  heading_to_branch: 'bg-indigo-100 text-indigo-800',
  picked_up: 'bg-cyan-100 text-cyan-800',
  delivering: 'bg-violet-100 text-violet-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function AdminDispatch() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches,
    showBranchFilter,
    applyBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;

  const load = useCallback(async () => {
    try {
      const data = await listDeliveryJobs({ branchId: filterBranch });
      setJobs(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Error cargando despacho');
    } finally {
      setLoading(false);
    }
  }, [filterBranch]);

  useEffect(() => {
    load();
    const unsub = subscribeDispatch(() => load());
    const t = setInterval(() => {
      load();
      retryStaleDriverSearches().catch(() => {});
    }, 20000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  const syncFromOrders = async () => {
    setBusy('sync');
    setMsg('');
    try {
      const orders = applyBranchFilter(await fetchOrdersAdmin());
      const deliveryReady = orders.filter(
        (o) => o.orderType === 'delivery' && ['listo', 'preparando', 'confirmado', 'en_cocina', 'en_delivery'].includes(o.estado)
      );
      let n = 0;
      for (const o of deliveryReady.slice(0, 30)) {
        try {
          await upsertJobFromOrder(o.id);
          n += 1;
        } catch {
          /* pedido sin tabla o sin permisos */
        }
      }
      setMsg(`Sincronizados ${n} pedidos delivery → cola de despacho`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const offer = async (jobId) => {
    setBusy(jobId);
    try {
      const res = await startDriverSearch(jobId);
      setMsg(`Oferta enviada a ${res?.offered ?? 0} repartidor(es)`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Despacho"
        subtitle="Cola de delivery · ofertar a repartidores en tiempo real"
        actions={(
          <div className="flex flex-wrap gap-2">
            {showBranchFilter && (
              <AdminBranchFilter value={selectedBranchId} onChange={setSelectedBranchId} branches={branches} />
            )}
            <Button className="!px-3 !py-2 text-sm" disabled={busy === 'sync'} onClick={syncFromOrders}>
              {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar pedidos'}
            </Button>
          </div>
        )}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}

      {loading ? <Loader text="Cargando cola…" /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">#{job.ticket_code || '—'} · {job.customer_name}</p>
                  <p className="text-xs text-gray-500">{job.customer_address}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[job.status] || 'bg-gray-100'}`}>
                  {job.status}
                </span>
              </div>
              <div className="mb-3 flex justify-between text-sm">
                <span>Pedido {money(job.order_total)}</span>
                <span className="font-semibold text-pollon-orange">Delivery {money(job.delivery_fee)}</span>
              </div>
              {job.ep_driver_profiles?.profiles?.full_name && (
                <p className="mb-2 text-xs text-purple-700">🛵 {job.ep_driver_profiles.profiles.full_name}</p>
              )}
              {['ready_for_dispatch', 'searching_driver', 'offered'].includes(job.status) && (
                <Button className="w-full !py-2 text-sm" disabled={busy === job.id} onClick={() => offer(job.id)}>
                  {busy === job.id ? 'Ofertando…' : 'Ofertar a repartidores'}
                </Button>
              )}
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-gray-500">
              Sin jobs en cola. Pulsa <strong>Sincronizar pedidos</strong> cuando haya deliveries listos en cocina.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
