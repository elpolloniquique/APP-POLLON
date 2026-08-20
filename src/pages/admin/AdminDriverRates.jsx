import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, X, RefreshCw, Save } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { RatesZoneMap } from '../../components/delivery/RatesZoneMap';
import {
  getBranchDeliveryZones,
  saveBranchDeliveryZones,
  setTiersRuleActive,
} from '../../services/pricingService';
import { adminListAllBranches } from '../../services/branchService';
import {
  DEFAULT_DELIVERY_ZONES,
  coverageKm,
  formatKmRange,
  nextZoneColor,
  nextZoneName,
  normalizeZones,
  quoteFromZones,
} from '../../utils/deliveryZones';
import { money } from '../../utils/format';
import { Loader } from '../../components/ui/Loader';
import { DEFAULT_MAP_CENTER } from '../../utils/geo';

function emptyZoneForm(zones) {
  const sorted = normalizeZones(zones);
  const lastTo = sorted.length ? sorted[sorted.length - 1].to_km : 0;
  return {
    id: `z-${Date.now()}`,
    name: nextZoneName(sorted),
    color: nextZoneColor(sorted),
    from_km: lastTo,
    to_km: Number((lastTo + 0.5).toFixed(1)),
    fee: sorted.length ? sorted[sorted.length - 1].fee + 500 : 2500,
  };
}

function ZoneEditorModal({ open, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);
  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const to = Number(form.to_km);
    const from = Number(form.from_km) || 0;
    const fee = Math.round(Number(form.fee) || 0);
    if (!form.name?.trim()) return alert('Nombre obligatorio');
    if (!(to > from)) return alert('El km máximo debe ser mayor que el mínimo');
    if (fee <= 0) return alert('Ingresa un precio válido');
    onSave({
      ...form,
      name: form.name.trim(),
      from_km: from,
      to_km: to,
      fee,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="presentation"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative z-[10001] w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Editar zona"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{initial?._isNew ? 'Nueva tarifa' : 'Editar tarifa'}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-500">
            Nombre
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              placeholder="Zona 01"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-gray-500">
              Desde (km)
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.from_km}
                onChange={(e) => setForm({ ...form, from_km: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-500">
              Hasta (km)
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.to_km}
                onChange={(e) => setForm({ ...form, to_km: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-gray-500">
            Precio delivery ($)
            <input
              type="number"
              min={0}
              step={100}
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })}
              className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block text-xs font-semibold text-gray-500">
            Color en mapa
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border bg-white p-1"
              />
              <span className="text-sm text-gray-600">{form.color}</span>
            </div>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" className="flex-1 rounded-xl bg-pollon-red py-2.5 text-sm font-bold text-white hover:brightness-95">
            Guardar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function AdminDriverRates() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches: filterBranches,
    showBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();

  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;

  const [allBranches, setAllBranches] = useState([]);
  const [zones, setZones] = useState(DEFAULT_DELIVERY_ZONES);
  const [rule, setRule] = useState(null);
  const [kmActive, setKmActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [styleId, setStyleId] = useState('streets');
  const [editor, setEditor] = useState(null); // zone form or null
  const [highlightId, setHighlightId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState('');

  const chainZones = useCallback((list) => {
    const sorted = normalizeZones(list);
    return sorted.map((item, i) => ({
      ...item,
      from_km: i === 0 ? 0 : sorted[i - 1].to_km,
    }));
  }, []);

  const activeBranch = useMemo(() => {
    const list = allBranches.length ? allBranches : filterBranches;
    if (filterBranch) return list.find((b) => b.id === filterBranch) || list[0];
    return list[0] || null;
  }, [allBranches, filterBranches, filterBranch]);

  const storeCenter = useMemo(() => {
    if (activeBranch?.lat != null && activeBranch?.lng != null) {
      return { lat: Number(activeBranch.lat), lng: Number(activeBranch.lng) };
    }
    return DEFAULT_MAP_CENTER;
  }, [activeBranch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [br, pack] = await Promise.all([
        adminListAllBranches().catch(() => filterBranches || []),
        getBranchDeliveryZones(filterBranch),
      ]);
      setAllBranches(br || []);
      setZones(normalizeZones(pack.zones));
      setRule(pack.rule);
      setKmActive(pack.rule?.is_active !== false);
      setDirty(false);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las tarifas');
      setZones(DEFAULT_DELIVERY_ZONES);
    } finally {
      setLoading(false);
    }
  }, [filterBranch, filterBranches]);

  useEffect(() => { load(); }, [load]);

  const persist = async (nextZones, nextActive = kmActive) => {
    setSaving(true);
    setError('');
    setSaveOk('');
    try {
      const chained = chainZones(nextZones);
      const saved = await saveBranchDeliveryZones({
        branchId: filterBranch || activeBranch?.id || null,
        zones: chained,
        ruleId: rule?.id,
        isActive: nextActive,
      });
      setRule(saved);
      setZones(normalizeZones(saved.tiers || chained));
      setDirty(false);
      setSaveOk('Tarifas actualizadas y guardadas correctamente.');
      return saved;
    } catch (e) {
      setError(e.message || 'No se pudo guardar');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      await persist(zones, kmActive);
    } catch {
      /* error shown */
    }
  };

  const toggleKmActive = async () => {
    const next = !kmActive;
    setKmActive(next);
    try {
      if (rule?.id && !String(rule.id).startsWith('demo-')) {
        await setTiersRuleActive(rule.id, next);
      } else {
        await persist(zones, next);
      }
    } catch (e) {
      setKmActive(!next);
      setError(e.message);
    }
  };

  const openNew = () => setEditor({ ...emptyZoneForm(zones), _isNew: true });
  const openEdit = (z) => setEditor({ ...z, _isNew: false });

  const saveZone = async (z) => {
    const { _isNew, ...zone } = z;
    let next;
    if (_isNew) {
      next = normalizeZones([...zones, zone]);
    } else {
      next = normalizeZones(zones.map((x) => (x.id === zone.id ? zone : x)));
    }
    // Recalc from_km chain
    next = chainZones(next);
    setZones(next);
    setEditor(null);
    try {
      await persist(next);
    } catch {
      setDirty(true);
    }
  };

  const removeZone = async (id) => {
    if (!confirm('¿Eliminar esta zona de tarifa?')) return;
    const chained = chainZones(zones.filter((z) => z.id !== id));
    setZones(chained);
    try {
      await persist(chained);
    } catch {
      setDirty(true);
    }
  };

  const resetDefaults = async () => {
    if (!confirm('¿Restaurar las 4 zonas por defecto (2.5 / 3 / 3.5 / 5 km)?')) return;
    setZones(DEFAULT_DELIVERY_ZONES);
    try {
      await persist(DEFAULT_DELIVERY_ZONES);
    } catch {
      setDirty(true);
    }
  };

  const maxKm = coverageKm(zones);
  const updatedLabel = rule?.updated_at
    ? new Date(rule.updated_at).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  const previewQuotes = useMemo(() => {
    const samples = [0.05, 0.8, 2.5, 6];
    return samples.map((km) => {
      const q = quoteFromZones(zones, km);
      return { km, ...q };
    });
  }, [zones]);

  return (
    <div className="admin-page flex h-[calc(100dvh-3.5rem)] flex-col">
      <AdminPageHeader
        title="Tarifas de Delivery"
        subtitle="Configura las tarifas por kilómetro o por zonas de entrega"
        actions={showBranchFilter ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sucursal actual</span>
            <AdminBranchFilter
              value={selectedBranchId || activeBranch?.id || ''}
              onChange={setSelectedBranchId}
              branches={filterBranches}
            />
          </div>
        ) : null}
      />

      {saveOk && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {saveOk}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Loader text="Cargando tarifas…" />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_340px]">
            <RatesZoneMap
              className="h-full min-h-[380px]"
              center={storeCenter}
              zones={kmActive ? zones : []}
              storeLabel="EL POLLÓN"
              styleId={styleId}
              onStyleChange={setStyleId}
              highlightZoneId={highlightId}
            />

            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
              {/* Tarifas por km */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Tarifas por Kilómetro</h3>
                    <p className="text-[11px] text-gray-500">Desde el centro de la sucursal (0.0 km)</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleKmActive}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      kmActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {kmActive ? 'Activo' : 'Inactivo'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openNew}
                  disabled={!kmActive || saving}
                  className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-pollon-red py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Agregar Tarifa
                </button>

                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving || !kmActive}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Save className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
                  {saving ? 'Guardando…' : 'Actualizar y guardar'}
                </button>

                <div className="space-y-2">
                  {zones.map((z) => (
                    <div
                      key={z.id}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 transition hover:border-gray-200"
                      onMouseEnter={() => setHighlightId(z.id)}
                      onMouseLeave={() => setHighlightId(null)}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow" style={{ background: z.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{z.name}</p>
                        <p className="text-[11px] text-gray-500">{formatKmRange(z.from_km, z.to_km)}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-gray-900">{money(z.fee)}</p>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"
                        onClick={() => openEdit(z)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-600"
                        onClick={() => removeZone(z.id)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {zones.length === 0 && (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                      Sin zonas. Agrega la primera tarifa.
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
                  Las tarifas se calculan automáticamente según la distancia desde la sucursal hasta la dirección del cliente.
                </p>
              </section>

              {/* Placeholder tarifas fijas (como en el diseño) */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm opacity-80">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Tarifas Fijas por Zona</h3>
                    <p className="text-[11px] text-gray-500">Polígonos personalizados (próximamente)</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    Inactivo
                  </span>
                </div>
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-400"
                >
                  <Plus className="h-4 w-4" />
                  Agregar Tarifas Fijas
                </button>
                <p className="mt-2 text-[10px] text-gray-400">Las tarifas fijas están desactivadas.</p>
              </section>
            </aside>
          </div>

          {/* Footer resumen */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Centro de referencia</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {activeBranch?.name || 'El Pollón'}
                  {activeBranch?.city ? ` — ${activeBranch.city}` : ''}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Última actualización</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">{updatedLabel}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total de zonas</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {zones.length} zona{zones.length !== 1 ? 's' : ''} {kmActive ? 'activas' : '(inactivas)'}
                </p>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Cobertura total</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">Hasta {maxKm || '—'} km</p>
                </div>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                  title="Restaurar zonas por defecto"
                >
                  <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {zones.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {zones.map((z) => (
                  <div
                    key={`sum-${z.id}`}
                    className="rounded-xl border px-3 py-3"
                    style={{ borderColor: `${z.color}55`, background: `${z.color}12` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} />
                      <p className="text-xs font-bold text-gray-800">{z.name}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-600">{formatKmRange(z.from_km, z.to_km)}</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: z.color }}>{money(z.fee)}</p>
                  </div>
                ))}
              </div>
            )}

            {dirty && (
              <p className="mt-2 text-xs text-amber-700">
                Hay cambios sin guardar. Pulsa <strong>Actualizar y guardar</strong> para aplicarlos en el checkout.
              </p>
            )}

            {kmActive && zones.length > 0 && (
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Verificación de cotización (desde sucursal)
                </p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-gray-700">
                  {previewQuotes.map(({ km, fee, zone, outOfRange }) => (
                    <li key={km} className="flex justify-between gap-2">
                      <span>{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</span>
                      <span className="font-semibold">
                        {outOfRange ? 'Fuera de cobertura' : `${zone?.name || 'Zona'} · ${money(fee)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!activeBranch?.lat && (
              <p className="mt-2 text-xs text-amber-700">
                Esta sucursal no tiene coordenadas GPS. Configura lat/lng en Supursales o ejecuta el SQL de GPS para centrar el mapa correctamente.
              </p>
            )}
          </div>
        </>
      )}

      <ZoneEditorModal
        open={!!editor}
        initial={editor || emptyZoneForm(zones)}
        onClose={() => setEditor(null)}
        onSave={saveZone}
      />
    </div>
  );
}
