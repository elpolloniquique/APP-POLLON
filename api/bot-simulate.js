/**
 * Simulador El Pollón Bot (FASE 5) — no envía WhatsApp.
 * POST /api/bot-simulate
 * Body: { phone, message, branchId?, profileName? }
 *
 * Auth: X-EP-WA-SECRET / ?secret=  o Bearer JWT staff
 */
import { cors, parseBody, getSupabaseAdmin, getSupabaseUserClient, env } from '../lib/whatsapp/supabaseAdmin.js';
import { processInbound } from '../lib/bot/engine.js';

function secretOk(req) {
  const expected = env('EP_WA_WEBHOOK_SECRET', 'BOT_SIMULATE_SECRET');
  if (!expected) return false;
  const header = req.headers['x-ep-wa-secret'] || req.headers['apikey'] || '';
  const q = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return header === expected || q === expected;
}

async function staffOk(req, admin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return false;
  const userClient = getSupabaseUserClient(token);
  if (!userClient) return false;
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return false;
  const { data: caller } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (!caller || caller.is_active === false) return false;
  const role = caller.role === 'administrador' ? 'admin_sucursal' : caller.role;
  return ['super_admin', 'admin_sucursal'].includes(role);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ ok: false, error: 'supabase_admin' });

  const allowed = secretOk(req) || (await staffOk(req, admin));
  if (!allowed) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = parseBody(req);
  try {
    const result = await processInbound({
      admin,
      phone: body.phone,
      message: body.message || body.text,
      profileName: body.profileName || body.name || '',
      branchId: body.branchId || body.branch_id || null,
      messageId: body.messageId || null,
      simulate: true,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
