/**
 * Cron Vercel: re-oferta jobs sin aceptación (~cada minuto) + push.
 * Vars: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VAPID_*, CRON_SECRET (opcional)
 */
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function env(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

function ticketShort(code) {
  const s = String(code || '').replace(/^0+/, '');
  return s || String(code || '—');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = env('CRON_SECRET');
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    const q = req.query?.secret;
    const ok = auth === `Bearer ${cronSecret}` || q === cronSecret;
    // Vercel Cron (Hobby) no siempre manda Bearer; permitir sin secret solo en GET desde vercel cron header
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

  const { data, error } = await admin.rpc('ep_retry_stale_driver_searches');
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const jobIds = data?.job_ids || [];
  const vapidPublic = env('VITE_VAPID_PUBLIC_KEY', 'VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  let pushed = 0;

  if (vapidPublic && vapidPrivate && jobIds.length) {
    webpush.setVapidDetails(
      env('VAPID_SUBJECT', 'mailto:contacto@el-pollon.cl'),
      vapidPublic,
      vapidPrivate
    );

    for (const jobId of jobIds) {
      const { data: offers } = await admin
        .from('ep_delivery_offers')
        .select('id, driver_id, offered_fee, ep_delivery_jobs(ticket_code, customer_name, delivery_fee)')
        .eq('job_id', jobId)
        .eq('status', 'pending');
      if (!offers?.length) continue;

      const driverIds = [...new Set(offers.map((o) => o.driver_id))];
      const { data: subs } = await admin
        .from('ep_driver_push_subscriptions')
        .select('endpoint, p256dh, auth, driver_id')
        .in('driver_id', driverIds);

      const byDriver = Object.fromEntries(offers.map((o) => [o.driver_id, o]));
      for (const sub of subs || []) {
        const offer = byDriver[sub.driver_id];
        if (!offer) continue;
        const job = offer.ep_delivery_jobs || {};
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: 'Nuevo pedido — El Pollón',
              body: `Pedido Nº ${ticketShort(job.ticket_code)} · ${job.customer_name || 'Cliente'} (reintento)`,
              url: '/repartidor',
              offerId: offer.id,
              jobId,
              tag: `pollon-offer-${offer.id}`,
            }),
            { urgency: 'high', TTL: 86400 }
          );
          pushed += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }

  return res.status(200).json({ ok: true, retried: data?.retried || 0, job_ids: jobIds, pushed });
}
