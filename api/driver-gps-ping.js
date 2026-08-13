/**
 * POST nativo (Capgo FGS) — no depende del WebView.
 * Body Capgo Location: { latitude, longitude, accuracy, bearing, speed, source }
 * Query: ?k=<gps_ping_token>
 */
import { createClient } from '@supabase/supabase-js';

function env(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.query?.k || req.query?.token || '').trim();
  if (!UUID_RE.test(token)) {
    return res.status(401).json({ error: 'token inválido' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng requeridos' });
  }

  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Faltan vars Supabase' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const numOrNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const { data, error } = await admin.rpc('ep_upsert_driver_location_by_ping', {
    p_token: token,
    p_lat: lat,
    p_lng: lng,
    p_heading: numOrNull(body.bearing ?? body.heading),
    p_speed: numOrNull(body.speed),
    p_accuracy: numOrNull(body.accuracy),
  });

  if (error) {
    console.warn('[Pollón] gps-ping:', error.message);
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json({ ok: true, ...data });
}
