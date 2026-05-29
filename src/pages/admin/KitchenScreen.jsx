import { useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { elapsedMinutes, estadoLabel } from '../../utils/format';
import { Button } from '../../components/ui/Button';

const KITCHEN_STATES = ['pendiente', 'confirmado', 'preparando'];

export function KitchenScreen() {
  const { orders, updateOrder, refresh } = useOrders();
  const { filterOrders, branchName, isBranchScoped } = useStaffBranch();
  const ordersScoped = useMemo(() => filterOrders(orders), [orders, filterOrders]);

  const pending = useMemo(
    () => ordersScoped
      .filter((o) => KITCHEN_STATES.includes(o.estado))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
    [ordersScoped]
  );

  const markReady = async (order) => {
    await updateOrder({ ...order, estado: 'listo' });
    refresh();
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl text-pollon-black">🍳 Cocina digital</h2>
      {isBranchScoped && (
        <p className="text-sm font-medium text-pollon-red">Sucursal: {branchName}</p>
      )}
      <p className="text-gray-600">{pending.length} pedidos en cola</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pending.map((o) => (
          <article key={o.id} className="rounded-2xl border-2 border-pollon-orange bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <span className="font-mono text-2xl font-bold text-pollon-red">#{o.codigo_pedido || o.ticketNumber}</span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                {elapsedMinutes(o.createdAt)} min
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{estadoLabel(o.estado)} · {o.orderType}</p>
            <ul className="mt-4 space-y-2 border-t pt-3">
              {(o.items || []).map((it, i) => (
                <li key={i} className="text-sm">
                  <strong>{it.qty}x</strong> {it.name}
                  {it.drink && <span className="block text-xs text-gray-500">🥤 {it.drink}</span>}
                  {it.notes && <span className="block text-xs text-pollon-red">📝 {it.notes}</span>}
                </li>
              ))}
            </ul>
            {o.customer?.comments && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm"><strong>Obs:</strong> {o.customer.comments}</p>
            )}
            <Button className="mt-4 w-full" onClick={() => markReady(o)}>✓ Marcar como listo</Button>
          </article>
        ))}
      </div>
      {!pending.length && (
        <div className="rounded-2xl bg-green-50 py-16 text-center text-green-800">
          <p className="text-xl font-bold">Sin pedidos pendientes en cocina</p>
        </div>
      )}
    </div>
  );
}
