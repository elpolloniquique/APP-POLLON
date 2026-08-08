/**
 * Proxy Evolution + simulador + live — SOLO super_admin.
 * POST /api/wa-evolution-admin
 * Body: { action, branchId, ... }
 *
 * actions: status | qr | logout | restart | simulate | retry_outbox |
 *          set_human | set_bot | mark_alerts_read | metrics | ping_ollama
 */
import { cors, parseBody, getSupabaseAdmin, getSupabaseUserClient, env } from '../lib/whatsapp/supabaseAdmin.js';
import {
  evolutionConfigured,
  ensureInstance,
  connectInstance,
  connectionState,
  logoutInstance,
} from '../lib/whatsapp/evolution.js';
import { ensureSettingsRow, updateSession } from '../lib/whatsapp/knowledge.js';
import { evolutionInstanceName } from '../lib/whatsapp/phone.js';
import { handleInbound } from '../lib/whatsapp/engine.js';
import { retryPendingOutbox } from '../lib/whatsapp/notify.js';
import { loadWaMetrics } from '../lib/whatsapp/metrics.js';
import { pingOllama, ollamaConfigured, defaultOllamaModel } from '../lib/whatsapp/ollama.js';

async function requireSuperAdmin(req, admin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { error: 'Sin autorización', status: 401 };
  const userClient = getSupabaseUserClient(token);
  if (!userClient) return { error: 'Sesión inválida', status: 401 };
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return { error: 'Sesión inválida', status: 401 };
  const { data: caller } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (!caller || caller.is_active === false) return { error: 'Perfil no autorizado', status: 403 };
  if (caller.role !== 'super_admin') return { error: 'Solo super admin', status: 403 };
  return { caller };
}

function webhookPublicUrl() {
  const secret = env('EP_WA_WEBHOOK_SECRET');
  const site = (env('VITE_PUBLIC_SITE_URL', 'EP_PUBLIC_SITE_URL') || 'https://www.el-pollon.cl').replace(/\/+$/, '');
  const base = `${site}/api/wa-evolution-webhook`;
  return secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });

  const auth = await requireSuperAdmin(req, admin);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const body = parseBody(req);
  const action = body.action;
  const branchId = body.branchId || body.branch_id;
  if (!action) return res.status(400).json({ error: 'action requerida' });

  try {
    if (action === 'metrics') {
      const metrics = await loadWaMetrics(admin, { branchId: branchId || null, days: Number(body.days) || 7 });
      return res.status(200).json({ ok: true, metrics });
    }

    if (action === 'ping_ollama') {
      const r = await pingOllama(body.model || defaultOllamaModel());
      return res.status(200).json({ ok: r.ok, configured: ollamaConfigured(), ...r });
    }

    if (action === 'simulate') {
      if (!branchId) return res.status(400).json({ error: 'branchId requerido' });
      const result = await handleInbound({
        admin,
        instance: null,
        phone: body.phone || '56900000000',
        text: body.text || 'hola',
        pushName: body.name || 'Simulador',
        simulate: true,
        branchId,
      });
      return res.status(200).json(result);
    }

    if (action === 'retry_outbox') {
      const results = await retryPendingOutbox(admin, { branchId, limit: 30 });
      return res.status(200).json({ ok: true, results });
    }

    if (action === 'set_human' || action === 'set_bot') {
      const sessionId = body.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });
      const timeout = Number(body.human_timeout_min) || 120;
      const patch = action === 'set_human'
        ? { mode: 'human', human_until: new Date(Date.now() + timeout * 60 * 1000).toISOString() }
        : { mode: 'bot', human_until: null };
      const session = await updateSession(admin, sessionId, patch);
      return res.status(200).json({ ok: true, session });
    }

    if (action === 'mark_alerts_read') {
      let q = admin.from('ep_wa_alerts').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (branchId) q = q.eq('branch_id', branchId);
      if (body.alertId) q = admin.from('ep_wa_alerts').update({ read_at: new Date().toISOString() }).eq('id', body.alertId);
      await q;
      return res.status(200).json({ ok: true });
    }

    if (!branchId) return res.status(400).json({ error: 'branchId requerido' });
    const settings = await ensureSettingsRow(admin, branchId);
    const instance = settings.evolution_instance || evolutionInstanceName(branchId);

    if (action === 'status') {
      if (!evolutionConfigured()) {
        return res.status(200).json({
          ok: true,
          configured: false,
          connected: false,
          state: 'unconfigured',
          instance,
          phone: settings.connected_phone,
        });
      }
      const st = await connectionState(instance);
      await admin.from('ep_wa_settings').update({
        connected: st.connected,
        connected_phone: st.phone || settings.connected_phone,
        evolution_instance: instance,
        updated_at: new Date().toISOString(),
      }).eq('branch_id', branchId);
      return res.status(200).json({
        ok: true,
        configured: true,
        connected: st.connected,
        state: st.state,
        instance,
        phone: st.phone || settings.connected_phone,
      });
    }

    if (action === 'qr') {
      if (!evolutionConfigured()) {
        return res.status(400).json({ error: 'Faltan EVOLUTION_API_URL / EVOLUTION_API_KEY en Vercel' });
      }
      const qr = await ensureInstance(instance, webhookPublicUrl());
      const st = await connectionState(instance);
      await admin.from('ep_wa_settings').update({
        evolution_instance: instance,
        connected: st.connected,
        connected_phone: st.phone || null,
        last_qr_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('branch_id', branchId);
      return res.status(200).json({
        ok: true,
        instance,
        connected: st.connected,
        state: st.state,
        phone: st.phone,
        qr: qr.qr,
        pairingCode: qr.pairingCode,
      });
    }

    if (action === 'logout') {
      if (evolutionConfigured()) {
        try { await logoutInstance(instance); } catch { /* ignore */ }
      }
      await admin.from('ep_wa_settings').update({
        connected: false,
        connected_phone: null,
        updated_at: new Date().toISOString(),
      }).eq('branch_id', branchId);
      return res.status(200).json({ ok: true, connected: false });
    }

    if (action === 'restart') {
      if (!evolutionConfigured()) {
        return res.status(400).json({ error: 'Evolution no configurado' });
      }
      try { await logoutInstance(instance); } catch { /* ignore */ }
      const qr = await connectInstance(instance);
      return res.status(200).json({ ok: true, qr: qr.qr, pairingCode: qr.pairingCode });
    }

    return res.status(400).json({ error: `Acción desconocida: ${action}` });
  } catch (err) {
    console.error('[wa-admin]', err?.message || err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}
