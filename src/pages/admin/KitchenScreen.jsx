import { useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { elapsedMinutes, estadoLabel } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminScrollPanel } from '../../components/admin/AdminScrollPanel';

const KITCHEN_STATES = ['pendiente', 'confirmado', 'preparando'];

export function KitchenScreen() {
  const { orders, updateOrder, refresh } = useOrders();
  const { applyBranchFilter, headerBranchLabel, isBranchScoped } = useAdminBranchFilter();
  const ordersScoped = useMemo(() => applyBranchFilter(orders), [orders, applyBranchFilter]);

  const pending = useMemo(
    () => ordersScoped
      .filter((o) => KITCHEN_STATES.includes(o.estado))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
    [ordersScoped],
  );

  const markReady = async (order) => {
    await updateOrder({ ...order, estado: 'listo' });
    refresh();
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="🍳 Cocina digital"
        subtitle={`${pending.length} pedido${pending.length !== 1 ? 's' : ''} en cola`}
        branchLabel={headerBranchLabel}
      />

      {pending.length > 0 ? (
        <AdminScrollPanel maxRows={6} variant="grid" className="rounded-2xl border border-gray-100 bg-transparent p-2 shadow-none sm:p-3">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {pending.map((o) => (
              <article key={o.id} className="rounded-2xl border-2 border-pollon-orange bg-white p-4 shadow-lg sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xl font-bold text-pollon-red sm:text-2xl">#{o.codigo_pedido || o.ticketNumber}</span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                    {elapsedMinutes(o.createdAt)} min
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">{estadoLabel(o.estado)} · {o.orderType}</p>
                <ul className="mt-3 space-y-1.5 border-t pt-3 sm:mt-4 sm:space-y-2">
                  {(o.items || []).map((it, i) => (
                    <li key={i} className="text-sm">
                      <strong>{it.qty}x</strong> {it.name}
                      {it.drink && <span className="block text-xs text-gray-500">🥤 {it.drink}</span>}
                      {it.notes && <span className="block text-xs text-pollon-red">📝 {it.notes}</span>}
                    </li>
                  ))}
                </ul>
                {o.customer?.comments && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs sm:text-sm"><strong>Obs:</strong> {o.customer.comments}</p>
                )}
                <Button className="mt-3 w-full sm:mt-4" onClick={() => markReady(o)}>✓ Marcar como listo</Button>
              </article>
            ))}
          </div>
        </AdminScrollPanel>
      ) : (
        <div className="rounded-2xl bg-green-50 py-12 text-center text-green-800 sm:py-16">
          <p className="text-lg font-bold sm:text-xl">Sin pedidos pendientes en cocina</p>
        </div>
      )}
    </div>
  );
}
