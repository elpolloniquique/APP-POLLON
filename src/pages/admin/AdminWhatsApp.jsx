import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, QrCode, RefreshCw, Unplug, Save, Plus, Trash2,
  Play, UserRound, Bot, Bell, BookOpen, Wifi, WifiOff, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../services/authService';
import { adminListAllBranches } from '../../services/branchService';
import {
  waAdmin,
  ensureWaSettings,
  saveWaSettings,
  listWaKb,
  saveWaKb,
  deleteWaKb,
  listWaSessions,
  listWaAlerts,
  listWaOutbox,
  DEFAULT_TEMPLATES,
  DEFAULT_COMPLAINT_KEYWORDS,
  DEFAULT_LOYALTY_TIERS,
} from '../../services/whatsappAdminService';
import '../../styles/admin-whatsapp.css';

const TABS = [
  { id: 'conexion', label: 'Conexión' },
  { id: 'configurar', label: 'Configurar' },
  { id: 'entrenar', label: 'Entrenar + Live' },
];

const TEMPLATE_KEYS = [
  ['bienvenida', 'Bienvenida'],
  ['como_comprar', 'Cómo comprar'],
  ['confirmacion_pedido', 'Confirmación de pedido'],
  ['estado_cocina', 'Estado: cocina'],
  ['estado_reparto', 'Estado: en camino'],
  ['estado_entregado', 'Estado: entregado'],
  ['estado_cancelado', 'Estado: cancelado'],
  ['queja_cliente', 'Queja / humano'],
  ['fallback', 'Fallback'],
  ['sucursal_info', 'Sucursal'],
  ['menu_listado', 'Menú'],
  ['plato', 'Plato'],
  ['horario', 'Horario'],
  ['delivery_info', 'Delivery'],
  ['bestsellers', 'Más vendidos'],
  ['estado_pedido', 'Estado del pedido'],
];

function Badge({ connected, configured }) {
  if (!configured) return <span className="awa-badge awa-badge--off">Sin configurar</span>;
  if (connected) return <span className="awa-badge awa-badge--on"><Wifi className="h-3.5 w-3.5" /> Conectado</span>;
  return <span className="awa-badge awa-badge--off"><WifiOff className="h-3.5 w-3.5" /> Desconectado</span>;
}

export function AdminWhatsApp() {
  const { profile, can } = useAuth();
  const isSuper = normalizeRole(profile?.role || profile?.rol) === 'super_admin' || can('whatsapp_ai');

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState('conexion');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [evo, setEvo] = useState({ configured: false, connected: false, state: '', qr: null, phone: null });
  const [qrLoading, setQrLoading] = useState(false);

  const [kb, setKb] = useState([]);
  const [kbForm, setKbForm] = useState({ title: '', keywords: '', pregunta: '', respuesta: '', prioridad: 10, activa: true });
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [simText, setSimText] = useState('hola');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  const branch = useMemo(() => branches.find((b) => b.id === branchId) || null, [branches, branchId]);

  const flash = (ok, text) => {
    setErr(ok ? '' : text);
    setMsg(ok ? text : '');
  };

  useEffect(() => {
    if (!isSuper) return;
    adminListAllBranches()
      .then((list) => {
        const active = (list || []).filter((b) => b.isActive !== false);
        setBranches(active.length ? active : list || []);
        setBranchId((prev) => prev || active[0]?.id || list?.[0]?.id || '');
      })
      .catch(() => setBranches([]));
  }, [isSuper]);

  const loadAll = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      const s = await ensureWaSettings(id);
      setSettings(s);
      const [k, sess, al, ob, st] = await Promise.all([
        listWaKb(id).catch(() => []),
        listWaSessions(id).catch(() => []),
        listWaAlerts(id).catch(() => []),
        listWaOutbox().catch(() => []),
        waAdmin('status', { branchId: id }).catch(() => ({ configured: false, connected: false })),
      ]);
      setKb(k);
      setSessions(sess);
      setAlerts(al);
      setOutbox(ob);
      setEvo((prev) => ({ ...prev, ...st, qr: prev.qr && !st.connected ? prev.qr : null }));
    } catch (e) {
      setErr(e.message || 'No se pudo cargar WhatsApp inteligente. ¿Ejecutaste fix-whatsapp-inteligente.sql?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (branchId) loadAll(branchId); }, [branchId, loadAll]);

  function patch(field, value) {
    setSettings((s) => (s ? { ...s, [field]: value } : s));
  }

  function patchTemplate(key, value) {
    setSettings((s) => (s ? { ...s, templates: { ...s.templates, [key]: value } } : s));
  }

  async function handleSaveConfig() {
    if (!settings || !branchId) return;
    setSaving(true);
    try {
      const saved = await saveWaSettings(branchId, {
        enabled: settings.enabled,
        modo_proactivo: settings.modo_proactivo,
        avisos_en_modo_humano: settings.avisos_en_modo_humano,
        enviar_foto_plato: settings.enviar_foto_plato,
        usar_horario_sucursal: settings.usar_horario_sucursal,
        bot_24_7: settings.bot_24_7,
        bot_from: settings.bot_from,
        bot_to: settings.bot_to,
        human_timeout_min: Number(settings.human_timeout_min) || 120,
        contar_compras_solo_sucursal: settings.contar_compras_solo_sucursal,
        lookback_hours: Number(settings.lookback_hours) || 48,
        rate_limit_per_min: Number(settings.rate_limit_per_min) || 4,
        link_web: settings.link_web,
        templates: settings.templates,
        complaint_keywords: settings.complaint_keywords,
        loyalty_tiers: settings.loyalty_tiers,
      });
      setSettings(saved);
      flash(true, 'Configuración guardada. Se aplica en el siguiente mensaje.');
    } catch (e) {
      flash(false, e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(next) {
    patch('enabled', next);
    try {
      const saved = await saveWaSettings(branchId, { enabled: next });
      setSettings(saved);
      flash(true, next ? 'WhatsApp inteligente activado en esta sucursal' : 'Desactivado en esta sucursal');
    } catch (e) {
      flash(false, e.message);
    }
  }

  async function handleQr() {
    setQrLoading(true);
    setErr('');
    try {
      const r = await waAdmin('qr', { branchId });
      setEvo({
        configured: true,
        connected: r.connected,
        state: r.state,
        qr: r.qr,
        phone: r.phone,
      });
      if (r.connected) flash(true, 'Ya está conectado.');
    } catch (e) {
      flash(false, e.message);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleStatus() {
    try {
      const r = await waAdmin('status', { branchId });
      setEvo((p) => ({ ...p, ...r }));
    } catch (e) {
      flash(false, e.message);
    }
  }

  async function handleLogout() {
    if (!confirm('¿Desconectar el WhatsApp de esta sucursal?')) return;
    try {
      await waAdmin('logout', { branchId });
      setEvo({ configured: true, connected: false, state: 'close', qr: null, phone: null });
      flash(true, 'Desconectado.');
    } catch (e) {
      flash(false, e.message);
    }
  }

  async function handleSaveKb(e) {
    e.preventDefault();
    try {
      await saveWaKb({
        ...kbForm,
        branch_id: branchId,
        keywords: kbForm.keywords,
      });
      setKbForm({ title: '', keywords: '', pregunta: '', respuesta: '', prioridad: 10, activa: true });
      setKb(await listWaKb(branchId));
      flash(true, 'Entrada de entrenamiento guardada.');
    } catch (ex) {
      flash(false, ex.message);
    }
  }

  async function handleSimulate(e) {
    e.preventDefault();
    setSimLoading(true);
    try {
      const r = await waAdmin('simulate', { branchId, text: simText, phone: '56911111111', name: 'Simulador' });
      setSimResult(r);
    } catch (ex) {
      flash(false, ex.message);
    } finally {
      setSimLoading(false);
    }
  }

  if (!isSuper) {
    return <div className="admin-whatsapp admin-whatsapp--denied">Solo Super Admin puede ver WhatsApp inteligente.</div>;
  }

  return (
    <div className="admin-whatsapp">
      <header className="awa-header">
        <div>
          <p className="awa-breadcrumb">Administración</p>
          <h1 className="awa-title"><MessageCircle className="awa-title__icon" strokeWidth={2.2} /> WhatsApp inteligente</h1>
          <p className="awa-sub">Atención y avisos por sucursal · concierge, no cajero</p>
        </div>
        <div className="awa-header__actions">
          <select className="awa-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.city ? ` · ${b.city}` : ''}</option>
            ))}
          </select>
          <Badge connected={evo.connected} configured={evo.configured !== false && (evo.configured || settings)} />
          <label className="awa-toggle">
            <input
              type="checkbox"
              checked={!!settings?.enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              disabled={!settings}
            />
            <span>Activar en esta sucursal</span>
          </label>
        </div>
      </header>

      {(msg || err) && (
        <div className={`awa-flash ${err ? 'awa-flash--err' : 'awa-flash--ok'}`}>{err || msg}</div>
      )}

      <nav className="awa-tabs" aria-label="Secciones WhatsApp">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`awa-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading || !settings ? (
        <div className="awa-loading">Cargando sucursal…</div>
      ) : (
        <div className="awa-body">
          {tab === 'conexion' && (
            <section className="awa-grid awa-grid--2">
              <article className="awa-card">
                <h2>Número de la sucursal</h2>
                <p className="awa-help">Debe coincidir con <code>branches.whatsapp</code> de {branch?.name}.</p>
                <p className="awa-phone">{branch?.whatsapp || 'Sin WhatsApp en sucursal'}</p>
                {evo.phone && String(evo.phone).replace(/\D/g, '') !== String(branch?.whatsapp || '').replace(/\D/g, '') && (
                  <p className="awa-warn"><AlertTriangle className="h-4 w-4" /> El número conectado ({evo.phone}) no coincide con el de la sucursal.</p>
                )}
                <p className="awa-meta">Instancia Evolution: <code>{settings.evolution_instance}</code></p>
                <p className="awa-help">
                  Debe quedar abierto WhatsApp en el teléfono del local o un teléfono dedicado.
                  Si se cae internet del teléfono, se cae el bot. Vercel no mantiene el socket: Evolution corre 24/7 en PC u Oracle Always Free.
                </p>
              </article>

              <article className="awa-card">
                <h2>QR Evolution</h2>
                <div className="awa-qr-actions">
                  <button type="button" className="awa-btn awa-btn--red" onClick={handleQr} disabled={qrLoading}>
                    <QrCode className="h-4 w-4" /> {qrLoading ? 'Generando…' : 'Generar / recargar QR'}
                  </button>
                  <button type="button" className="awa-btn" onClick={handleStatus}>
                    <RefreshCw className="h-4 w-4" /> Estado
                  </button>
                  <button type="button" className="awa-btn" onClick={handleLogout} disabled={!evo.connected}>
                    <Unplug className="h-4 w-4" /> Desconectar
                  </button>
                </div>
                {evo.qr ? (
                  <img
                    className="awa-qr"
                    alt="QR WhatsApp"
                    src={evo.qr.startsWith('data:') ? evo.qr : `data:image/png;base64,${evo.qr.replace(/^data:image\/png;base64,/, '')}`}
                  />
                ) : (
                  <div className="awa-qr awa-qr--empty">{evo.connected ? 'Conectado — no hace falta QR.' : 'Pulsa generar QR.'}</div>
                )}
                <p className="awa-meta">Estado: {evo.state || '—'} · {evo.configured === false ? 'Faltan vars EVOLUTION_* en Vercel' : 'API configurada'}</p>
              </article>
            </section>
          )}

          {tab === 'configurar' && (
            <section className="awa-config">
              <article className="awa-card">
                <h2>Comportamiento</h2>
                <label className="awa-check">
                  <input type="checkbox" checked={!!settings.modo_proactivo} onChange={(e) => patch('modo_proactivo', e.target.checked)} />
                  Modo proactivo (el bot escribe primero al crear el pedido)
                </label>
                {settings.modo_proactivo && (
                  <p className="awa-warn"><AlertTriangle className="h-4 w-4" /> Riesgo de bloqueo de WhatsApp si escribes a clientes que nunca te hablaron. Recomendado: OFF y usar “Activar avisos” en el checkout.</p>
                )}
                <label className="awa-check">
                  <input type="checkbox" checked={settings.avisos_en_modo_humano !== false} onChange={(e) => patch('avisos_en_modo_humano', e.target.checked)} />
                  Enviar avisos de estado aunque el chat esté en modo humano
                </label>
                <label className="awa-check">
                  <input type="checkbox" checked={settings.usar_horario_sucursal !== false} onChange={(e) => patch('usar_horario_sucursal', e.target.checked)} />
                  Respetar horario de la sucursal
                </label>
                <label className="awa-check">
                  <input type="checkbox" checked={!!settings.bot_24_7} onChange={(e) => patch('bot_24_7', e.target.checked)} />
                  Bot 24/7 (ignora horario)
                </label>
                <label className="awa-check">
                  <input type="checkbox" checked={settings.contar_compras_solo_sucursal !== false} onChange={(e) => patch('contar_compras_solo_sucursal', e.target.checked)} />
                  Fidelización: contar compras solo de esta sucursal
                </label>
                <div className="awa-row">
                  <label>Timeout humano (min)
                    <input type="number" min={15} max={720} value={settings.human_timeout_min} onChange={(e) => patch('human_timeout_min', e.target.value)} />
                  </label>
                  <label>Lookback pedido (h)
                    <input type="number" min={6} max={168} value={settings.lookback_hours} onChange={(e) => patch('lookback_hours', e.target.value)} />
                  </label>
                  <label>Máx. msgs / min
                    <input type="number" min={1} max={10} value={settings.rate_limit_per_min} onChange={(e) => patch('rate_limit_per_min', e.target.value)} />
                  </label>
                </div>
                <label>Link web
                  <input type="url" value={settings.link_web || ''} onChange={(e) => patch('link_web', e.target.value)} />
                </label>
              </article>

              <article className="awa-card">
                <h2>Palabras de queja</h2>
                <p className="awa-help">Separadas por coma. Al detectarlas: empatía + modo humano + alerta.</p>
                <textarea
                  rows={3}
                  value={(settings.complaint_keywords || []).join(', ')}
                  onChange={(e) => patch('complaint_keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                />
                <button type="button" className="awa-btn" onClick={() => patch('complaint_keywords', [...DEFAULT_COMPLAINT_KEYWORDS])}>
                  Restablecer keywords
                </button>
              </article>

              <article className="awa-card">
                <h2>Fidelización (tramos)</h2>
                <p className="awa-help">No inventa descuentos. Solo calidez según N compras no canceladas.</p>
                {(settings.loyalty_tiers || []).map((t, i) => (
                  <div className="awa-row" key={`${t.n}-${i}`}>
                    <label>N°
                      <input
                        type="number"
                        min={1}
                        value={t.n}
                        onChange={(e) => {
                          const next = [...settings.loyalty_tiers];
                          next[i] = { ...next[i], n: Number(e.target.value) || 1 };
                          patch('loyalty_tiers', next);
                        }}
                      />
                    </label>
                    <label className="awa-grow">Texto
                      <input
                        value={t.text}
                        onChange={(e) => {
                          const next = [...settings.loyalty_tiers];
                          next[i] = { ...next[i], text: e.target.value };
                          patch('loyalty_tiers', next);
                        }}
                      />
                    </label>
                  </div>
                ))}
                <button type="button" className="awa-btn" onClick={() => patch('loyalty_tiers', DEFAULT_LOYALTY_TIERS.map((x) => ({ ...x })))}>
                  Restablecer tramos
                </button>
              </article>

              <article className="awa-card awa-card--templates">
                <h2>Plantillas</h2>
                <p className="awa-help">Variables: {'{nombre} {sucursal} {codigo} {detalle} {total} {pago} {tipo} {link_web} {link_tienda} {horario} {estado_atencion} {agradecimiento_fidelidad}'}</p>
                <div className="awa-templates">
                  {TEMPLATE_KEYS.map(([key, label]) => (
                    <label key={key}>{label}
                      <textarea
                        rows={key.includes('confirmacion') || key === 'bienvenida' || key === 'como_comprar' ? 7 : 4}
                        value={settings.templates?.[key] || ''}
                        onChange={(e) => patchTemplate(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <button type="button" className="awa-btn" onClick={() => patch('templates', { ...DEFAULT_TEMPLATES })}>
                  Restablecer plantillas default
                </button>
              </article>

              <div className="awa-savebar">
                <button type="button" className="awa-btn awa-btn--red" onClick={handleSaveConfig} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </div>
            </section>
          )}

          {tab === 'entrenar' && (
            <section className="awa-live">
              <article className="awa-card">
                <h2><BookOpen className="h-4 w-4" /> Entrenar (KB)</h2>
                <form className="awa-kb-form" onSubmit={handleSaveKb}>
                  <input placeholder="Título" value={kbForm.title} onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })} required />
                  <input placeholder="Keywords (coma)" value={kbForm.keywords} onChange={(e) => setKbForm({ ...kbForm, keywords: e.target.value })} />
                  <input placeholder="Pregunta / frase" value={kbForm.pregunta} onChange={(e) => setKbForm({ ...kbForm, pregunta: e.target.value })} />
                  <textarea placeholder="Respuesta (puedes usar {sucursal} {link_web}…)" rows={3} value={kbForm.respuesta} onChange={(e) => setKbForm({ ...kbForm, respuesta: e.target.value })} required />
                  <div className="awa-row">
                    <label>Prioridad
                      <input type="number" min={1} max={100} value={kbForm.prioridad} onChange={(e) => setKbForm({ ...kbForm, prioridad: e.target.value })} />
                    </label>
                    <button type="submit" className="awa-btn awa-btn--red"><Plus className="h-4 w-4" /> Agregar</button>
                  </div>
                </form>
                <div className="awa-scroll">
                  <table className="awa-table">
                    <thead><tr><th>Título</th><th>Keywords</th><th>Pri</th><th /></tr></thead>
                    <tbody>
                      {kb.map((row) => (
                        <tr key={row.id} className={row.activa === false ? 'is-off' : ''}>
                          <td>{row.title}</td>
                          <td className="awa-muted">{(row.keywords || []).join(', ')}</td>
                          <td>{row.prioridad}</td>
                          <td>
                            <button type="button" className="awa-icon-btn" title="Eliminar" onClick={async () => { await deleteWaKb(row.id); setKb(await listWaKb(branchId)); }}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!kb.length && <tr><td colSpan={4} className="awa-muted">Sin entradas aún.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="awa-card">
                <h2><Play className="h-4 w-4" /> Simulador</h2>
                <p className="awa-help">Mismo motor, sin WhatsApp. Prueba con la sucursal seleccionada.</p>
                <form onSubmit={handleSimulate} className="awa-sim">
                  <input value={simText} onChange={(e) => setSimText(e.target.value)} placeholder="Escribe un mensaje de cliente…" />
                  <button type="submit" className="awa-btn awa-btn--red" disabled={simLoading}>{simLoading ? '…' : 'Probar'}</button>
                </form>
                {simResult && (
                  <div className="awa-sim-out">
                    <p><strong>Intención:</strong> {simResult.intent || '—'}</p>
                    {simResult.loyalty?.count != null && <p><strong>Compras:</strong> {simResult.loyalty.count}</p>}
                    <pre>{simResult.reply || simResult.error || JSON.stringify(simResult, null, 2)}</pre>
                  </div>
                )}
              </article>

              <article className="awa-card">
                <h2><Bell className="h-4 w-4" /> Alertas</h2>
                <div className="awa-scroll">
                  {(alerts || []).map((a) => (
                    <div key={a.id} className={`awa-alert ${a.read_at ? '' : 'is-unread'}`}>
                      <strong>{a.type}</strong> · {a.phone || '—'}
                      <p>{a.preview}</p>
                      <small>{a.created_at ? new Date(a.created_at).toLocaleString('es-CL') : ''}</small>
                    </div>
                  ))}
                  {!alerts.length && <p className="awa-muted">Sin alertas.</p>}
                </div>
                <button type="button" className="awa-btn" onClick={async () => { await waAdmin('mark_alerts_read', { branchId }); setAlerts(await listWaAlerts(branchId)); }}>
                  Marcar leídas
                </button>
              </article>

              <article className="awa-card">
                <h2>Conversaciones</h2>
                <div className="awa-scroll">
                  <table className="awa-table">
                    <thead><tr><th>Teléfono</th><th>Modo</th><th>Última intención</th><th /></tr></thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{s.phone}{s.last_name ? ` · ${s.last_name}` : ''}</td>
                          <td>{s.mode === 'human' ? 'Humano' : 'Bot'}</td>
                          <td className="awa-muted">{s.last_intent || '—'}</td>
                          <td className="awa-row-btns">
                            <button type="button" className="awa-icon-btn" title="Pasar a humano" onClick={async () => { await waAdmin('set_human', { sessionId: s.id, human_timeout_min: settings.human_timeout_min }); setSessions(await listWaSessions(branchId)); }}>
                              <UserRound className="h-4 w-4" />
                            </button>
                            <button type="button" className="awa-icon-btn" title="Devolver al bot" onClick={async () => { await waAdmin('set_bot', { sessionId: s.id }); setSessions(await listWaSessions(branchId)); }}>
                              <Bot className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!sessions.length && <tr><td colSpan={4} className="awa-muted">Aún no hay chats.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="awa-card">
                <h2>Outbox (avisos)</h2>
                <div className="awa-scroll">
                  <table className="awa-table">
                    <thead><tr><th>Pedido</th><th>Evento</th><th>Estado</th></tr></thead>
                    <tbody>
                      {outbox.slice(0, 25).map((o) => (
                        <tr key={o.id}>
                          <td>{String(o.order_id).slice(0, 18)}</td>
                          <td>{o.event}</td>
                          <td>{o.status}{o.error_text ? ` · ${o.error_text.slice(0, 40)}` : ''}</td>
                        </tr>
                      ))}
                      {!outbox.length && <tr><td colSpan={3} className="awa-muted">Vacío.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="awa-btn" onClick={async () => { await waAdmin('retry_outbox', { branchId }); setOutbox(await listWaOutbox()); flash(true, 'Reintento enviado.'); }}>
                  Reintentar pendientes
                </button>
              </article>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
