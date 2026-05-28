import { useState } from 'react';
import { Button } from '../../components/ui/Button';

const STOCK_KEY = 'pollon_stock_v1';

function loadStock() {
  try { return JSON.parse(localStorage.getItem(STOCK_KEY) || '[]'); } catch { return []; }
}

export function AdminInventory() {
  const [items, setItems] = useState(loadStock);
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState(0);
  const [minimo, setMinimo] = useState(5);

  const save = (list) => {
    localStorage.setItem(STOCK_KEY, JSON.stringify(list));
    setItems(list);
  };

  const agregar = () => {
    if (!nombre.trim()) return;
    save([...items, { id: Date.now(), nombre, cantidad, minimo, updated: new Date().toISOString() }]);
    setNombre('');
    setCantidad(0);
  };

  const movimiento = (id, delta) => {
    save(items.map((i) => (i.id === id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)));
  };

  const bajo = items.filter((i) => i.cantidad <= i.minimo);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Control de stock</h2>
      {bajo.length > 0 && (
        <div className="rounded-xl bg-red-50 p-4 text-red-800">
          <strong>⚠️ Alerta bajo stock:</strong> {bajo.map((i) => i.nombre).join(', ')}
        </div>
      )}
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Insumo" className="rounded-lg border px-3 py-2" />
        <input type="number" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} placeholder="Cantidad" className="w-24 rounded-lg border px-3 py-2" />
        <input type="number" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} placeholder="Mín." className="w-20 rounded-lg border px-3 py-2" />
        <Button onClick={agregar}>Agregar insumo</Button>
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <div>
              <p className="font-semibold">{i.nombre}</p>
              <p className="text-sm text-gray-500">Mín: {i.minimo} · Actual: <strong className={i.cantidad <= i.minimo ? 'text-red-600' : ''}>{i.cantidad}</strong></p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" className="!px-2" onClick={() => movimiento(i.id, -1)}>−</Button>
              <Button variant="ghost" className="!px-2" onClick={() => movimiento(i.id, 1)}>+</Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Sincronización con Supabase: tabla inventario_insumos en schema-enterprise.sql</p>
    </div>
  );
}
