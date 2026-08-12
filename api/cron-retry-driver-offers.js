/**
 * Cron Vercel: re-oferta jobs sin aceptación + FCM/Web Push.
 * Vars: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VAPID_*,
 *       FIREBASE_SERVICE_ACCOUNT_JSON (o FCM_SERVER_KEY), CRON_SECRET
 */
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { env, sendFcm, isFcmConfigured, fcmModeLabel } from './_lib/fcmSend.js';

function ticketShort(code) {
  const s = String(code || '').replace(/^0+/, '');
  return s || String(code || '—');
}

function moneyCLP(n) {
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  } catch {
    return `$${Math.round(Number(n) || 0)}`;
  }
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
  const hasFcm = isFcmConfigured();
  let fcmSent = 0;
  let webSent = 0;
  const staleFcm = [];

  for (const jobId of jobIds) {
    const { data: offers } = await admin
      .from('ep_delivery_offers')
      .select('id, driver_id, offered_fee, ep_delivery_jobs(ticket_code, customer_name, delivery_fee)')
      .eq('job_id', jobId)
      .eq('status', 'pending');
    if (!offers?.length) continue;

    const driverIds = [...new Set(offers.map((o) => o.driver_id))];
    const byDriver = Object.fromEntries(offers.map((o) => [o.driver_id, o]));

    if (hasFcm) {
      const { data: fcmRows } = await admin
        .from('ep_driver_fcm_tokens')
        .select('id, driver_id, token')
        .in('driver_id', driverIds);
      for (const row of fcmRows || []) {
        const offer = byDriver[row.driver_id];
        if (!offer) continue;
        const job = offer.ep_delivery_jobs || {};
        const fee = offer.offered_fee ?? job.delivery_fee ?? 0;
        try {
          const result = await sendFcm(row.token, {
            title: 'El Pollón · Nuevo pedido',
            body: `#${ticketShort(job.ticket_code)} · ${job.customer_name || 'Cliente'} · ${moneyCLP(fee)} (reintento)`,
            data: {
              type: 'driver_offer',
              offerId: String(offer.id),
              jobId: String(jobId),
              deepLink: '/repartidor',
              url: '/repartidor',
              tag: `pollon-offer-${offer.id}`,
            },
          });
          if (result.ok) fcmSent += 1;
          else if (result.notRegistered) staleFcm.push(row.id);
        } catch (err) {
          console.warn('[Pollón] cron FCM:', err?.message || err);
        }
      }
    }

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(
        env('VAPID_SUBJECT', 'mailto:contacto@el-pollon.cl'),
        vapidPublic,
        vapidPrivate,
      );
      const { data: subs } = await admin
        .from('ep_driver_push_subscriptions')
        .select('endpoint, p256dh, auth, driver_id')
        .in('driver_id', driverIds);
      for (const sub of subs || []) {
        const offer = byDriver[sub.driver_id];
        if (!offer) continue;
        const job = offer.ep_delivery_jobs || {};
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: 'El Pollón · Nuevo pedido',
              body: `Pedido Nº ${ticketShort(job.ticket_code)} · ${job.customer_name || 'Cliente'} (reintento)`,
              url: '/repartidor',
              offerId: offer.id,
              jobId,
              tag: `pollon-offer-${offer.id}`,
              type: 'driver_offer',
            }),
            { urgency: 'high', TTL: 86400 },
          );
          webSent += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (staleFcm.length) {
    await admin.from('ep_driver_fcm_tokens').delete().in('id', staleFcm);
  }

  return res.status(200).json({
    ok: true,
    retried: data?.retried || 0,
    job_ids: jobIds,
    fcmSent,
    webSent,
    pushed: fcmSent + webSent,
    fcmConfigured: hasFcm,
    fcmMode: fcmModeLabel(),
  });
}
