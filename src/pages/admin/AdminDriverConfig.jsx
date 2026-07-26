import { useEffect, useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { getDispatchSettings, saveDispatchSettings } from '../../services/trackingService';
import { Button } from '../../components/ui/Button';
import { Loader } from '../../components/ui/Loader';

export function AdminDriverConfig() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches,
    showBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();

  const activeBranchId = isSuperAdmin ? (selectedBranchId || branches[0]?.id) : staffBranchId;
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeBranchId) {
      setLoading(false);
      setForm(null);
      return;
    }
    setLoading(true);
    getDispatchSettings(activeBranchId)
      .then((data) => setForm({
        enabled: data?.enabled ?? true,
        auto_offer: data?.auto_offer ?? false,
        offer_ttl_seconds: data?.offer_ttl_seconds ?? 60,
        max_search_radius_km: data?.max_search_radius_km ?? 8,
        arrival_radius_m: data?.arrival_radius_m ?? 80,
        customer_arrival_radius_m: data?.customer_arrival_radius_m ?? 60,
        max_orders_per_driver: data?.max_orders_per_driver ?? 2,
        require_gps: data?.require_gps ?? true,
        voice_alerts: data?.voice_alerts ?? false,
        notes: data?.notes || '',
      }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeBranchId]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!activeBranchId || !form) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await saveDispatchSettings(activeBranchId, form);
      setMsg('Configuración guardada');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <AdminPageHeader
        title="Configuración repartidores"
        subtitle="Despacho por sucursal: TTL de oferta, radios GPS, capacidad y alertas"
        actions={showBranchFilter ? (
          <AdminBranchFilter value={selectedBranchId || activeBranchId || ''} onChange={setSelectedBranchId} branches={branches} />
        ) : null}
      />

      {!activeBranchId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Selecciona una sucursal para configurar el despacho.
        </div>
      )}

      {loading && <Loader text="Cargando configuración…" />}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}

      {form && activeBranchId && (
        <div className="grid max-w-3xl gap-4 rounded-2xl border bg-white p-4 sm:p-6">
          {[
            { key: 'enabled', label: 'Despacho activo en esta sucursal' },
            { key: 'auto_offer', label: 'Ofertar automáticamente a repartidores disponibles' },
            { key: 'require_gps', label: 'Exigir GPS para aceptar pedidos' },
            { key: 'voice_alerts', label: 'Alertas de voz en mapa en vivo' },
          ].map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <span className="text-sm font-medium">{f.label}</span>
              <input type="checkbox" checked={!!form[f.key]} onChange={(e) => update(f.key, e.target.checked)} className="h-5 w-5 accent-pollon-red" />
            </label>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              TTL oferta (segundos)
              <input type="number" min={15} max={300} value={form.offer_ttl_seconds} onChange={(e) => update('offer_ttl_seconds', Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>
            <label className="text-sm">
              Radio búsqueda (km)
              <input type="number" min={1} max={30} step={0.5} value={form.max_search_radius_km} onChange={(e) => update('max_search_radius_km', Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>
            <label className="text-sm">
              Radio llegada local (m)
              <input type="number" min={20} max={300} value={form.arrival_radius_m} onChange={(e) => update('arrival_radius_m', Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>
            <label className="text-sm">
              Radio llegada cliente (m)
              <input type="number" min={20} max={300} value={form.customer_arrival_radius_m} onChange={(e) => update('customer_arrival_radius_m', Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>
            <label className="text-sm">
              Máx. pedidos por repartidor
              <input type="number" min={1} max={5} value={form.max_orders_per_driver} onChange={(e) => update('max_orders_per_driver', Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>
          </div>

          <label className="text-sm">
            Notas internas
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2" />
          </label>

          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</Button>
        </div>
      )}
    </div>
  );
}
