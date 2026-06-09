import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { adminSaveBranch } from '../../services/branchService';
import { Button } from '../../components/ui/Button';
import { useStaffBranch } from '../../hooks/useStaffBranch';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { canManageAllBranches } from '../../services/authService';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { normalizeDeliveryCost } from '../../utils/format';
import { testNetworkPrinter, saveBranchPrinterConfigLocal } from '../../utils/networkPrinter';
import { ReservationScheduleEditor } from '../../components/admin/ReservationScheduleEditor';
import { normalizeReservationSchedule, DEFAULT_RESERVATION_SLOT } from '../../utils/orderTypeConfig';

const INPUT = 'admin-config-input';
const INPUT_MONO = 'admin-config-input admin-config-input--mono';

function ConfigSection({ title, description, children }) {
  return (
    <section className="admin-config-section">
      <div className="admin-config-section__head">
        <h3 className="admin-config-section__title">{title}</h3>
        {description && <p className="admin-config-section__desc">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ConfigField({ label, hint, children, span = 1 }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : undefined}>
      <label className="admin-config-field__label">{label}</label>
      {hint && <p className="admin-config-field__hint">{hint}</p>}
      <div className="admin-config-field__control">{children}</div>
    </div>
  );
}

function ConfigToggle({ label, checked, onChange, children }) {
  return (
    <div className="admin-config-toggle">
      <label className="admin-config-toggle__label">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="admin-config-toggle__text">{label}</span>
      </label>
      {checked && children && <div className="admin-config-toggle__body">{children}</div>}
    </div>
  );
}

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
    delivery_cost: '',
    delivery_eta: '30-45 min',
    delivery_activo: true,
    pickup_activo: true,
    reservas_activas: true,
    pickup_min_order: 0,
    reservation_min_order: 0,
    reservation_schedule: { slots: [] },
    mensaje_cliente: '¡Gracias por tu pedido!',
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
    thermal_network_print_enabled: false,
    thermal_printer_ip: '',
    thermal_printer_port: 9100,
    thermal_print_bridge_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerTestMsg, setPrinterTestMsg] = useState('');

  useEffect(() => {
    if (isBranchScoped && branch) {
      setCfg({
        nombre_tienda: branch.name || '',
        telefono: branch.phone || '',
        whatsapp: branch.whatsapp || '',
        direccion: branch.address || '',
        horario: branch.schedule || '',
        delivery_cost: branch.deliveryCost ?? '',
        delivery_eta: branch.deliveryEta || '30-45 min',
        delivery_activo: branch.deliveryEnabled !== false,
        pickup_activo: branch.pickupEnabled !== false,
        reservas_activas: branch.reservationsEnabled !== false,
        pickup_min_order: branch.pickupMinOrder || 0,
        reservation_min_order: branch.reservationMinOrder || 0,
        reservation_schedule: normalizeReservationSchedule(branch.reservationSchedule),
        mensaje_cliente: '¡Gracias por tu pedido!',
        facebook_url: branch.facebookUrl || '',
        instagram_url: branch.instagramUrl || '',
        tiktok_url: branch.tiktokUrl || '',
        thermal_network_print_enabled: branch.thermalNetworkPrintEnabled === true,
        thermal_printer_ip: branch.thermalPrinterIp || '',
        thermal_printer_port: branch.thermalPrinterPort || 9100,
        thermal_print_bridge_url: branch.thermalPrintBridgeUrl || '',
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
          deliveryCost: normalizeDeliveryCost(cfg.delivery_cost),
          deliveryEta: cfg.delivery_eta,
          deliveryEnabled: cfg.delivery_activo,
          pickupEnabled: cfg.pickup_activo,
          reservationsEnabled: cfg.reservas_activas,
          pickupMinOrder: Math.max(0, Number(cfg.pickup_min_order) || 0),
          reservationMinOrder: Math.max(0, Number(cfg.reservation_min_order) || 0),
          reservationSchedule: normalizeReservationSchedule(cfg.reservation_schedule),
          isActive: branch.isActive !== false,
          facebookUrl: cfg.facebook_url,
          instagramUrl: cfg.instagram_url,
          tiktokUrl: cfg.tiktok_url,
          thermalNetworkPrintEnabled: cfg.thermal_network_print_enabled,
          thermalPrinterIp: cfg.thermal_printer_ip,
          thermalPrinterPort: Number(cfg.thermal_printer_port) || 9100,
          thermalPrintBridgeUrl: cfg.thermal_print_bridge_url,
        }, { id: profile?.id, email: profile?.email });
        saveBranchPrinterConfigLocal(branchId, {
          enabled: cfg.thermal_network_print_enabled,
          ip: cfg.thermal_printer_ip,
          port: Number(cfg.thermal_printer_port) || 9100,
          bridgeUrl: cfg.thermal_print_bridge_url,
        });
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

  const testPrinter = async () => {
    setTestingPrinter(true);
    setPrinterTestMsg('');
    try {
      const msg = await testNetworkPrinter({
        ip: cfg.thermal_printer_ip,
        port: Number(cfg.thermal_printer_port) || 9100,
        bridgeUrl: cfg.thermal_print_bridge_url,
      });
      setPrinterTestMsg(msg);
    } catch (e) {
      setPrinterTestMsg(e.message || 'Error al probar impresora');
    } finally {
      setTestingPrinter(false);
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

  const branchFields = [
    { key: 'nombre_tienda', label: 'Nombre del local', span: 2 },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'direccion', label: 'Dirección', span: 2 },
    { key: 'horario', label: 'Horario de atención', span: 2 },
    { key: 'delivery_eta', label: 'Tiempo estimado delivery' },
    { key: 'mensaje_cliente', label: 'Mensaje a clientes', span: 2 },
  ];

  return (
    <div className="admin-config-page admin-page">
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

      <div className="admin-config-shell ring-1 ring-black/5">
        <div className="admin-config-scroll admin-scroll-panel">
          <ConfigSection
            title="Datos del local"
            description="Información que ven tus clientes en la tienda y en el checkout."
          >
            <div className="admin-config-grid">
              {branchFields.map(({ key, label, span }) => (
                <ConfigField key={key} label={label} span={span || 1}>
                  <input
                    value={cfg[key] || ''}
                    onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
                    className={INPUT}
                  />
                </ConfigField>
              ))}
              {isBranchScoped && (
                <ConfigField
                  label="Costo delivery"
                  hint="Monto fijo (ej. 2500) o texto libre (ej. Varía según distancia)."
                  span={2}
                >
                  <input
                    type="text"
                    value={cfg.delivery_cost}
                    onChange={(e) => setCfg((c) => ({ ...c, delivery_cost: e.target.value }))}
                    placeholder="2500 o Varía según distancia"
                    className={INPUT}
                  />
                </ConfigField>
              )}
            </div>
          </ConfigSection>

          <ConfigSection
            title="Tipos de pedido"
            description="Activa o desactiva las opciones que aparecen al confirmar un pedido."
          >
            <div className="admin-config-stack">
              <ConfigToggle
                label="Delivery activo"
                checked={cfg.delivery_activo}
                onChange={(e) => setCfg((c) => ({ ...c, delivery_activo: e.target.checked }))}
              />

              {isBranchScoped && (
                <>
                  <ConfigToggle
                    label="Retiro en local activo"
                    checked={cfg.pickup_activo}
                    onChange={(e) => setCfg((c) => ({ ...c, pickup_activo: e.target.checked }))}
                  >
                    <ConfigField
                      label="Monto mínimo retiro (CLP)"
                      hint="Ej: 10000 para exigir al menos $10.000. Deja 0 si no hay mínimo."
                    >
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={cfg.pickup_min_order}
                        onChange={(e) => setCfg((c) => ({ ...c, pickup_min_order: e.target.value }))}
                        placeholder="0"
                        className={`${INPUT_MONO} max-w-xs`}
                      />
                    </ConfigField>
                  </ConfigToggle>

                  <ConfigToggle
                    label="Reservas activas"
                    checked={cfg.reservas_activas}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCfg((c) => {
                        const next = { ...c, reservas_activas: checked };
                        if (checked && !c.reservation_schedule?.slots?.length) {
                          next.reservation_schedule = { slots: [{ ...DEFAULT_RESERVATION_SLOT }] };
                        }
                        return next;
                      });
                    }}
                  >
                    <div className="space-y-4">
                      <ConfigField
                        label="Monto mínimo reserva (pedidos grandes)"
                        hint="Solo se podrá reservar si el carrito alcanza este monto. Ej: 50000."
                      >
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={cfg.reservation_min_order}
                          onChange={(e) => setCfg((c) => ({ ...c, reservation_min_order: e.target.value }))}
                          placeholder="0"
                          className={`${INPUT_MONO} max-w-xs`}
                        />
                      </ConfigField>
                      <ConfigField
                        label="Horarios disponibles"
                        hint="El cliente solo podrá reservar en los días y horas configurados."
                      >
                        <ReservationScheduleEditor
                          value={cfg.reservation_schedule}
                          onChange={(schedule) => setCfg((c) => ({ ...c, reservation_schedule: schedule }))}
                        />
                      </ConfigField>
                    </div>
                  </ConfigToggle>
                </>
              )}

              {!isBranchScoped && (
                <ConfigToggle
                  label="Reservas activas (global)"
                  checked={cfg.reservas_activas}
                  onChange={(e) => setCfg((c) => ({ ...c, reservas_activas: e.target.checked }))}
                />
              )}
            </div>
          </ConfigSection>

          {isBranchScoped && (
            <ConfigSection
              title="Impresora WiFi"
              description="Impresión térmica por red. Ejecuta el puente en un PC del local: node scripts/local-print-bridge.mjs"
            >
              <div className="admin-config-stack">
                <ConfigToggle
                  label="Activar impresión por red (WiFi)"
                  checked={cfg.thermal_network_print_enabled}
                  onChange={(e) => setCfg((c) => ({ ...c, thermal_network_print_enabled: e.target.checked }))}
                >
                  <div className="admin-config-grid">
                    <ConfigField label="IP de la impresora">
                      <input
                        value={cfg.thermal_printer_ip}
                        onChange={(e) => setCfg((c) => ({ ...c, thermal_printer_ip: e.target.value.trim() }))}
                        placeholder="192.168.1.100"
                        className={INPUT_MONO}
                      />
                    </ConfigField>
                    <ConfigField label="Puerto (9100)">
                      <input
                        type="number"
                        value={cfg.thermal_printer_port}
                        onChange={(e) => setCfg((c) => ({ ...c, thermal_printer_port: e.target.value }))}
                        className={INPUT_MONO}
                      />
                    </ConfigField>
                    <ConfigField
                      label="URL del puente local"
                      hint="IP del PC donde corre el puente. Ej: http://192.168.1.50:3009"
                      span={2}
                    >
                      <input
                        value={cfg.thermal_print_bridge_url}
                        onChange={(e) => setCfg((c) => ({ ...c, thermal_print_bridge_url: e.target.value.trim() }))}
                        placeholder="http://192.168.1.50:3009"
                        className={INPUT_MONO}
                      />
                    </ConfigField>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" onClick={testPrinter} disabled={testingPrinter}>
                      {testingPrinter ? 'Probando…' : 'Probar conexión'}
                    </Button>
                    {printerTestMsg && (
                      <span className={`text-xs ${printerTestMsg.includes('correctamente') || printerTestMsg.includes('accesible') ? 'text-green-700' : 'text-red-600'}`}>
                        {printerTestMsg}
                      </span>
                    )}
                  </div>
                </ConfigToggle>
              </div>
            </ConfigSection>
          )}

          {isBranchScoped && (
            <ConfigSection
              title="Redes sociales"
              description="Enlaces visibles en el footer cuando el cliente elige tu sucursal."
            >
              <div className="admin-config-grid">
                {[
                  { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/elpollon' },
                  { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/elpollon' },
                  { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@elpollon' },
                ].map(({ key, label, placeholder }) => (
                  <ConfigField key={key} label={label} span={2}>
                    <input
                      type="url"
                      value={cfg[key] || ''}
                      onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className={INPUT}
                    />
                  </ConfigField>
                ))}
              </div>
            </ConfigSection>
          )}
        </div>

        <footer className="admin-config-footer">
          <Button onClick={save} disabled={saving} className="min-w-[10rem]">
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
