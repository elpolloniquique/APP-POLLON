/**
 * Cron Vercel (backup diario en Hobby).
 * El reaviso cada ~1 min lo dispara el GPS ping nativo + panel admin.
 */
import { createClient } from '@supabase/supabase-js';
import { env, isFcmConfigured, fcmModeLabel } from './_lib/fcmSend.js';
import { retryAndNotifyOffers } from './_lib/retryAndNotify.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = env('CRON_SECRET');
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    const q = req.query?.secret;
    const ok = auth === `Bearer ${cronSecret}` || q === cronSecret;
    const fromVercel = Boolean(req.headers['x-vercel-cron']);
    if (!ok && !fromVercel) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Faltan SUPABASE_URL / SERVICE_ROLE' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await retryAndNotifyOffers(admin, { force: true });
  if (!result.ok && result.error) {
    return res.status(500).json(result);
  }

  return res.status(200).json({
    ...result,
    fcmConfigured: isFcmConfigured(),
    fcmMode: fcmModeLabel(),
  });
}
