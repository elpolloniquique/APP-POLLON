import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Info,
  Save,
  AlertTriangle,
  Radio,
  MapPin,
  Percent,
  Power,
  StickyNote,
} from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import {
  getDispatchSettings,
  saveDispatchSettings,
  applyDispatchDefaultsToDrivers,
  normalizeDispatchSettings,
  DISPATCH_SETTINGS_DEFAULTS,
} from '../../services/trackingService';
import { verifyDeliveryModule } from '../../services/driverService';
import { Loader } from '../../components/ui/Loader';
import '../../styles/dispatch-config.css';

const TOGGLES = [
  {
    key: 'enabled',
    label: 'Despacho activo',
    help: 'Apagado = no se ofertean pedidos (ni auto ni manual).',
  },
  {
    key: 'auto_offer',
    label: 'Oferta automática',
    help: 'Al llegar un delivery en Pedidos. Si está off, ofertarás desde Despacho.',
  },
  {
    key: 'require_gps',
    label: 'Exigir GPS',
    help: 'El repartidor debe publicar ubicación para estar disponible.',
  },
  {
    key: 'voice_alerts',
    label: 'Alertas de voz',
    help: 'Valor inicial del mapa en vivo (se puede silenciar allí).',
  },
];

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`dcfg-switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="dcfg-switch__knob" />
    </button>
  );
}

function Section({ icon: Icon, title, subtitle, children, className = '' }) {
  return (
    <section className={`dcfg-section ${className}`}>
      <header className="dcfg-section__head">
        <span className="dcfg-section__icon" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="dcfg-section__title">{title}</h3>
          {subtitle && <p className="dcfg-section__sub">{subtitle}</p>}
        </div>
      </header>
      <div className="dcfg-section__body">{children}</div>
    </section>
  );
}

function HealthPanel({ health, busy, onRun }) {
  const rows = useMemo(() => {
    if (!health || health.demo) return [];
    const out = [];
    const pushGroup = (label, obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([k, v]) => out.push({ group: label, key: k, ok: !!v }));
    };
    pushGroup('Tablas', health.tables);
    pushGroup('Funciones', health.functions);
    pushGroup('Columnas', health.columns);
    return out;
  }, [health]);

  return (
    <section className="dcfg-health-bar">
      <div className="dcfg-health-bar__main">
        <div className="dcfg-health-bar__text">
          <Activity className="h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="dcfg-health-bar__title">Salud del módulo</p>
            <p className="dcfg-health-bar__sub">Tablas, RPCs y columnas en Supabase</p>
          </div>
        </div>
        <button type="button" className="dcfg-btn dcfg-btn--ghost" disabled={busy} onClick={onRun}>
          {busy ? 'Comprobando…' : 'Verificar'}
        </button>
      </div>

      {health?.demo && (
        <p className="dcfg-note">Modo local — verificación no aplica.</p>
      )}

      {health && !health.demo && (
        <div className={`dcfg-health ${health.ok ? 'is-ok' : 'is-bad'}`}>
          <div className="dcfg-health__status">
            {health.ok
              ? <><CheckCircle2 className="h-4 w-4" /> Operativo</>
              : <><AlertTriangle className="h-4 w-4" /> Revisar SQL</>}
          </div>
          {health.error && <p className="dcfg-health__err">{health.error}</p>}
          {health.hint && <p className="dcfg-health__hint">{health.hint}</p>}
          {!!rows.length && (
            <ul className="dcfg-health__list">
              {rows.map((r) => (
                <li key={`${r.group}-${r.key}`} className={r.ok ? 'is-ok' : 'is-bad'}>
                  <span>{r.group}: {r.key}</span>
                  <strong>{r.ok ? 'OK' : 'Falta'}</strong>
                </li>
              ))}
            </ul>
          )}
          {!health.ok && (
            <p className="dcfg-health__hint">
              Ejecuta: <code>fix-delivery-production-ready.sql</code> y <code>fix-dispatch-config-v2.sql</code>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

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
  const activeBranchName = branches.find((b) => b.id === activeBranchId)?.name
    || branches.find((b) => b.id === activeBranchId)?.nombre
    || 'Sucursal';

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);

  useEffect(() => {
    if (!activeBranchId) {
      setLoading(false);
      setForm(null);
      return;
    }
    setLoading(true);
    setError('');
    getDispatchSettings(activeBranchId)
      .then((data) => setForm(normalizeDispatchSettings(data || DISPATCH_SETTINGS_DEFAULTS)))
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
      const saved = await saveDispatchSettings(activeBranchId, form);
      setForm(normalizeDispatchSettings(saved));
      setMsg('Configuración guardada correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const applyToDrivers = async () => {
    if (!activeBranchId || !form) return;
    const ok = window.confirm(
      `¿Aplicar cupo ${form.max_orders_per_driver} y comisión ${form.default_commission_percent}% a los repartidores de “${activeBranchName}”?`
    );
    if (!ok) return;
    setApplying(true);
    setMsg('');
    setError('');
    try {
      await saveDispatchSettings(activeBranchId, form);
      const res = await applyDispatchDefaultsToDrivers(activeBranchId, {
        maxOrders: form.max_orders_per_driver,
        commissionPercent: form.default_commission_percent,
      });
      setMsg(`Aplicado a ${res.updated} repartidor(es).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const runHealth = async () => {
    setHealthBusy(true);
    setHealth(null);
    try {
      setHealth(await verifyDeliveryModule());
    } catch (err) {
      setHealth({ ok: false, error: err.message });
    } finally {
      setHealthBusy(false);
    }
  };

  return (
    <div className="admin-page dispatch-config">
      <AdminPageHeader
        title="Configuración de despacho"
        subtitle="Parámetros por sucursal · ofertas, GPS, cupo y comisión"
        actions={showBranchFilter ? (
          <AdminBranchFilter
            value={selectedBranchId || activeBranchId || ''}
            onChange={setSelectedBranchId}
            branches={branches}
          />
        ) : null}
      />

      {!activeBranchId && (
        <div className="dcfg-alert dcfg-alert--warn">
          Selecciona una sucursal para configurar el despacho.
        </div>
      )}

      {error && <div className="dcfg-alert dcfg-alert--error">{error}</div>}
      {msg && <div className="dcfg-alert dcfg-alert--ok">{msg}</div>}

      {loading && <Loader text="Cargando configuración…" />}

      {form && activeBranchId && !loading && (
        <div className="dcfg-shell">
          <div className="dcfg-main">
            <HealthPanel health={health} busy={healthBusy} onRun={runHealth} />

            <Section icon={Power} title="Operación" subtitle={activeBranchName}>
              <div className="dcfg-toggles">
                {TOGGLES.map((f) => (
                  <div key={f.key} className="dcfg-toggle">
                    <div className="dcfg-toggle__text">
                      <p className="dcfg-toggle__label">{f.label}</p>
                      <p className="dcfg-toggle__help">{f.help}</p>
                    </div>
                    <Switch
                      checked={!!form[f.key]}
                      label={f.label}
                      onChange={(v) => update(f.key, v)}
                    />
                  </div>
                ))}
              </div>
            </Section>

            <Section
              icon={Radio}
              title="Ofertas"
              subtitle="TTL y reintento del motor de ofertas"
            >
              <div className="dcfg-grid dcfg-grid--3">
                <label className="dcfg-field">
                  <span>TTL oferta</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={15}
                      max={300}
                      value={form.offer_ttl_seconds}
                      onChange={(e) => update('offer_ttl_seconds', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">seg</span>
                  </div>
                  <em>Visible en el celular. Ideal: 120</em>
                </label>
                <label className="dcfg-field">
                  <span>Re-ofertar</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={60}
                      max={900}
                      value={form.retry_after_seconds}
                      onChange={(e) => update('retry_after_seconds', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">seg</span>
                  </div>
                  <em>Si nadie acepta. Ideal: 180</em>
                </label>
                <label className="dcfg-field">
                  <span>Radio búsqueda</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={0.5}
                      value={form.max_search_radius_km}
                      onChange={(e) => update('max_search_radius_km', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">km</span>
                  </div>
                  <em>Referencia · elegibilidad por sucursal</em>
                </label>
              </div>
            </Section>

            <Section
              icon={MapPin}
              title="GPS y mapa"
              subtitle="Radios de llegada al local y al cliente"
            >
              <div className="dcfg-grid dcfg-grid--2">
                <label className="dcfg-field">
                  <span>Llegada al local</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={20}
                      max={300}
                      value={form.arrival_radius_m}
                      onChange={(e) => update('arrival_radius_m', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">m</span>
                  </div>
                  <em>Alertas de voz al acercarse a la sucursal</em>
                </label>
                <label className="dcfg-field">
                  <span>Llegada al cliente</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={20}
                      max={300}
                      value={form.customer_arrival_radius_m}
                      onChange={(e) => update('customer_arrival_radius_m', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">m</span>
                  </div>
                  <em>Proximidad al destino del pedido</em>
                </label>
              </div>
            </Section>

            <Section
              icon={Percent}
              title="Cupo y comisión"
              subtitle="Defaults de la sucursal · se pueden personalizar por repartidor"
            >
              <div className="dcfg-grid dcfg-grid--2">
                <label className="dcfg-field">
                  <span>Cupo máx. pedidos</span>
                  <select
                    value={form.max_orders_per_driver}
                    onChange={(e) => update('max_orders_per_driver', Number(e.target.value))}
                  >
                    {[2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n} simultáneos</option>
                    ))}
                  </select>
                  <em>Mismo criterio que en Repartidores</em>
                </label>
                <label className="dcfg-field">
                  <span>Comisión</span>
                  <div className="dcfg-field__control">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.default_commission_percent}
                      onChange={(e) => update('default_commission_percent', Number(e.target.value))}
                    />
                    <span className="dcfg-field__unit">%</span>
                  </div>
                  <em>Sobre el delivery · ej. $4.000 × 5% = $200</em>
                </label>
              </div>

              <div className="dcfg-banner">
                <Info className="h-4 w-4 shrink-0" aria-hidden />
                <p>
                  <strong>Aplicar a repartidores</strong> copia cupo y comisión a quienes tienen esta sucursal preferida.
                  Los ajustes uno a uno siguen en Repartidores.
                </p>
              </div>

              <button
                type="button"
                className="dcfg-btn dcfg-btn--block"
                disabled={applying || saving}
                onClick={applyToDrivers}
              >
                {applying ? 'Aplicando…' : 'Aplicar cupo y comisión a repartidores'}
              </button>
            </Section>

            <Section icon={StickyNote} title="Notas internas" subtitle="Solo visibles en administración">
              <label className="dcfg-field">
                <span className="sr-only">Notas</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={3}
                  placeholder="Horarios especiales, observaciones del local…"
                />
              </label>
            </Section>
          </div>

          <aside className="dcfg-aside">
            <div className="dcfg-aside__card">
              <p className="dcfg-aside__label">Sucursal</p>
              <p className="dcfg-aside__branch" title={activeBranchName}>{activeBranchName}</p>
              <ul className="dcfg-aside__summary">
                <li><span>Despacho</span><strong>{form.enabled ? 'Activo' : 'Off'}</strong></li>
                <li><span>Auto oferta</span><strong>{form.auto_offer ? 'Sí' : 'No'}</strong></li>
                <li><span>TTL</span><strong>{form.offer_ttl_seconds}s</strong></li>
                <li><span>Cupo</span><strong>{form.max_orders_per_driver}</strong></li>
                <li><span>Comisión</span><strong>{form.default_commission_percent}%</strong></li>
              </ul>
              <button
                type="button"
                className="dcfg-btn dcfg-btn--primary dcfg-btn--block"
                disabled={saving}
                onClick={save}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </aside>

          <div className="dcfg-mobile-bar">
            <button
              type="button"
              className="dcfg-btn dcfg-btn--primary dcfg-btn--block"
              disabled={saving}
              onClick={save}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
