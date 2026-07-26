import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ensureMyDriverProfile, updateDriverProfile, setMyOperationalStatus } from '../../services/driverService';
import { Button } from '../../components/ui/Button';

export function DriverProfile() {
  const { profile } = useAuth();
  const [driver, setDriver] = useState(null);
  const [form, setForm] = useState({ vehicle_type: 'motocicleta', vehicle_plate: '', vehicle_color: '', phone: '', max_orders: 2 });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    ensureMyDriverProfile()
      .then((d) => {
        setDriver(d);
        setForm({
          vehicle_type: d.vehicle_type || 'motocicleta',
          vehicle_plate: d.vehicle_plate || '',
          vehicle_color: d.vehicle_color || '',
          phone: d.phone || profile?.phone || '',
          max_orders: d.max_orders || 2,
        });
      })
      .catch((err) => setError(err.message));
  }, [profile]);

  const save = async () => {
    if (!driver) return;
    try {
      await updateDriverProfile(driver.id, form);
      setMsg('Perfil actualizado');
    } catch (err) {
      setError(err.message);
    }
  };

  const goOffline = async () => {
    try {
      await setMyOperationalStatus('offline');
      setMsg('Ahora estás offline');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-xl font-bold">Perfil</h2>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="font-semibold">{profile?.fullName || profile?.nombre}</p>
        <p className="text-sm text-white/50">{profile?.email}</p>
        <p className="mt-1 text-xs text-pollon-orange capitalize">Rol: {profile?.role || profile?.rol}</p>
        {driver && (
          <p className="mt-1 text-xs text-white/40">Estado admin: {driver.admin_status}</p>
        )}
      </div>

      {error && <div className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</div>}
      {msg && <div className="rounded-xl bg-green-500/20 px-3 py-2 text-sm text-green-200">{msg}</div>}

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white p-4 text-pollon-black">
        <label className="block text-sm">
          Tipo de vehículo
          <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2">
            <option value="motocicleta">Motocicleta</option>
            <option value="automovil">Automóvil</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="bicicleta_electrica">Bicicleta eléctrica</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block text-sm">
          Patente
          <input value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Color
          <input value={form.vehicle_color} onChange={(e) => setForm({ ...form, vehicle_color: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Teléfono
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Capacidad (pedidos simultáneos)
          <input type="number" min={1} max={5} value={form.max_orders} onChange={(e) => setForm({ ...form, max_orders: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <Button onClick={save} className="w-full">Guardar</Button>
        <Button variant="outline" onClick={goOffline} className="w-full">Ponerme offline</Button>
      </div>
    </div>
  );
}
