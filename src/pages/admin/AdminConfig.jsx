import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { adminSaveBranch } from '../../services/branchService';
import { Button } from '../../components/ui/Button';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { canManageAllBranches } from '../../services/authService';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminConfig() {
  const { profile, role } = useAuth();
  const { branch, branchName, isBranchScoped, branchId } = useStaffBranch();
  const { refreshBranches } = useBranch();
  const [cfg, setCfg] = useState({
    nombre_tienda: 'Pollería El Pollón',
    telefono: '',
    whatsapp: '',
    direccion: '',
    horario: '',
    delivery_cost: 2000,
    delivery_eta: '30-45 min',
    delivery_activo: true,
    pickup_activo: true,
    reservas_activas: true,
    mensaje_cliente: '¡Gracias por tu pedido!',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isBranchScoped && branch) {
      setCfg({
        nombre_tienda: branch.name || '',
        telefono: branch.phone || '',
        whatsapp: branch.whatsapp || '',
        direccion: branch.address || '',
        horario: branch.schedule || '',
        delivery_cost: branch.deliveryCost ?? 2000,
        delivery_eta: branch.deliveryEta || '30-45 min',
        delivery_activo: branch.deliveryEnabled !== false,
        pickup_activo: branch.pickupEnabled !== false,
        reservas_activas: branch.reservationsEnabled !== false,
        mensaje_cliente: '¡Gracias por tu pedido!',
      });
      return;
    }

    const sb = getSupabase();
    if (!sb) return;
    sb.from('configuracion_tienda').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setCfg((c) => ({ ...c, ...data }));
    });
  }, [branch, isBranchScoped]);

  const save = async () => {
    setSaving(true);
    try {
      if (isBranchScoped && branchId && branch) {
        await adminSaveBranch({
          ...branch,
          name: cfg.nombre_tienda,
          phone: cfg.telefono,
          whatsapp: cfg.whatsapp,
          address: cfg.direccion,
          schedule: cfg.horario,
          deliveryCost: Number(cfg.delivery_cost) || 0,
          deliveryEta: cfg.delivery_eta,
          deliveryEnabled: cfg.delivery_activo,
          pickupEnabled: cfg.pickup_activo,
          reservationsEnabled: cfg.reservas_activas,
          isActive: branch.isActive !== false,
        }, { id: profile?.id, email: profile?.email });
        await refreshBranches();
        alert('Configuración de tu local guardada');
        return;
      }

      const sb = getSupabase();
      if (!sb) return;
      await sb.from('configuracion_tienda').upsert({ id: 1, ...cfg });
      alert('Configuración global guardada');
    } catch (e) {
      alert(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="admin-page space-y-4">
        <AdminPageHeader title="Configuración" branchLabel={isBranchScoped ? branchName : undefined} />
        <p className="rounded-xl bg-amber-50 p-4 text-sm">Sin Supabase: la configuración usa datos locales.</p>
      </div>
    );
  }

  if (isBranchScoped && !branchId) {
    return (
      <div className="admin-page rounded-xl bg-amber-50 p-6 text-amber-900">
        <h2 className="text-xl font-bold">Configuración</h2>
        <p className="mt-2 text-sm">Tu usuario no tiene sucursal asignada. El super admin debe vincular tu cuenta a un local en Supabase.</p>
      </div>
    );
  }

  const branchFields = {
    nombre_tienda: 'Nombre del local',
    telefono: 'Teléfono',
    whatsapp: 'WhatsApp',
    direccion: 'Dirección',
    horario: 'Horario de atención',
    delivery_eta: 'Tiempo estimado delivery',
    mensaje_cliente: 'Mensaje a clientes',
  };

  return (
    <div className="admin-page max-w-2xl">
      <AdminPageHeader
        title={isBranchScoped ? 'Configuración del local' : 'Configuración general'}
        subtitle={
          isBranchScoped
            ? 'Datos visibles en la tienda de tu sucursal'
            : canManageAllBranches(role)
              ? 'Configuración global de la plataforma'
              : undefined
        }
        branchLabel={isBranchScoped ? branchName : undefined}
      />
      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        {Object.entries(branchFields).map(([key, label]) => (
          <div key={key}>
            <label className="text-sm font-medium">{label}</label>
            <input
              value={cfg[key] || ''}
              onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </div>
        ))}
        {isBranchScoped && (
          <div>
            <label className="text-sm font-medium">Costo delivery (CLP)</label>
            <input
              type="number"
              value={cfg.delivery_cost}
              onChange={(e) => setCfg((c) => ({ ...c, delivery_cost: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.delivery_activo} onChange={(e) => setCfg((c) => ({ ...c, delivery_activo: e.target.checked }))} />
          Delivery activo
        </label>
        {isBranchScoped && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.pickup_activo} onChange={(e) => setCfg((c) => ({ ...c, pickup_activo: e.target.checked }))} />
            Retiro en local activo
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.reservas_activas} onChange={(e) => setCfg((c) => ({ ...c, reservas_activas: e.target.checked }))} />
          Reservas activas
        </label>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );
}
