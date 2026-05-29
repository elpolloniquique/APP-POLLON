import { useState, useMemo } from 'react';
import { useOrders } from '../../hooks/useOrders';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { money, todayISO } from '../../utils/format';
import { Button } from '../../components/ui/Button';

const CAJA_KEY = 'pollon_caja_v1';

function loadCaja() {
  try { return JSON.parse(localStorage.getItem(CAJA_KEY) || '{}'); } catch { return {}; }
}

export function AdminCash() {
  const { orders } = useOrders();
  const { filterOrders, branchName, isBranchScoped } = useStaffBranch();
  const ordersScoped = useMemo(() => filterOrders(orders), [orders, filterOrders]);
  const [caja, setCaja] = useState(loadCaja);
  const today = todayISO();

  const ventasHoy = useMemo(() => {
    const pedidos = ordersScoped.filter((o) => (o.createdAt || '').startsWith(today) && o.estado === 'entregado');
    const efectivo = pedidos.filter((o) => o.metodo_pago === 'efectivo').reduce((s, o) => s + o.total, 0);
    const transferencia = pedidos.filter((o) => o.metodo_pago === 'transferencia').reduce((s, o) => s + o.total, 0);
    const total = pedidos.reduce((s, o) => s + o.total, 0);
    return { efectivo, transferencia, total, count: pedidos.length };
  }, [ordersScoped, today]);

  const abrirCaja = () => {
    const monto = prompt('Monto inicial de caja (CLP):', '0');
    const data = { abierta: true, apertura: new Date().toISOString(), montoInicial: Number(monto) || 0, egresos: [] };
    localStorage.setItem(CAJA_KEY, JSON.stringify(data));
    setCaja(data);
  };

  const cerrarCaja = () => {
    const data = { ...caja, abierta: false, cierre: new Date().toISOString(), ventas: ventasHoy };
    localStorage.setItem(CAJA_KEY, JSON.stringify(data));
    setCaja(data);
    alert(`Caja cerrada. Total vendido: ${money(ventasHoy.total)}`);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Caja diaria</h2>
      {isBranchScoped && (
        <p className="text-sm font-medium text-pollon-red">Sucursal: {branchName}</p>
      )}
      <div className="flex gap-2">
        {!caja.abierta ? <Button onClick={abrirCaja}>Abrir caja</Button> : <Button variant="dark" onClick={cerrarCaja}>Cerrar caja</Button>}
        <span className={`self-center rounded-full px-3 py-1 text-sm font-semibold ${caja.abierta ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
          {caja.abierta ? 'Caja abierta' : 'Caja cerrada'}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Efectivo', ventasHoy.efectivo],
          ['Transferencia', ventasHoy.transferencia],
          ['Total del día', ventasHoy.total],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{l}</p>
            <p className="text-xl font-bold text-pollon-red">{money(v)}</p>
          </div>
        ))}
      </div>
      {caja.abierta && (
        <p className="text-sm text-gray-600">Monto inicial: {money(caja.montoInicial || 0)} · Pedidos entregados hoy: {ventasHoy.count}</p>
      )}
    </div>
  );
}
