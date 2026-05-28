import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { Button } from '../../components/ui/Button';
import { useBranch } from '../../context/BranchContext';

export function AdminConfig() {
  const { branch } = useBranch();
  const [cfg, setCfg] = useState({
    nombre_tienda: 'Pollería El Pollón',
    telefono: branch?.phone || '',
    whatsapp: branch?.whatsapp || '',
    direccion: branch?.address || '',
    horario: branch?.schedule || '',
    delivery_activo: true,
    reservas_activas: true,
    mensaje_cliente: '¡Gracias por tu pedido!',
  });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('configuracion_tienda').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setCfg((c) => ({ ...c, ...data }));
    });
  }, []);

  const save = async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('configuracion_tienda').upsert({ id: 1, ...cfg });
    alert('Configuración guardada');
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Configuración</h2>
        <p className="rounded-xl bg-amber-50 p-4 text-sm">Sin Supabase: la configuración usa datos de sucursal local.</p>
        <pre className="rounded-xl bg-gray-100 p-4 text-xs">{JSON.stringify(cfg, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-2xl font-bold">Configuración general</h2>
      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        {Object.entries({
          nombre_tienda: 'Nombre tienda',
          telefono: 'Teléfono',
          whatsapp: 'WhatsApp',
          direccion: 'Dirección',
          horario: 'Horario',
          mensaje_cliente: 'Mensaje clientes',
        }).map(([key, label]) => (
          <div key={key}>
            <label className="text-sm font-medium">{label}</label>
            <input
              value={cfg[key] || ''}
              onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </div>
        ))}
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.delivery_activo} onChange={(e) => setCfg((c) => ({ ...c, delivery_activo: e.target.checked }))} /> Delivery activo</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.reservas_activas} onChange={(e) => setCfg((c) => ({ ...c, reservas_activas: e.target.checked }))} /> Reservas activas</label>
        <Button onClick={save}>Guardar configuración</Button>
      </div>
    </div>
  );
}
