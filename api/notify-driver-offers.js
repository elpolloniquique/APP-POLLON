/**
 * Vercel Serverless — avisa a repartidores con oferta pendiente.
 * POST /api/notify-driver-offers  Body: { jobId }
 *
 * Prioridad:
 *  1) FCM HTTP v1 (FIREBASE_SERVICE_ACCOUNT_JSON)  ← recomendado
 *  2) FCM legacy (FCM_SERVER_KEY) si aún existe
 *  3) Web Push (VAPID) fallback
 */
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import {
  env,
  sendFcm,
  parseServiceAccount,
  isFcmConfigured,
  fcmModeLabel,
} from './_lib/fcmSend.js';

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

function ticketShort(code) {
  const s = String(code || '').replace(/^0+/, '');
  return s || String(code || '—');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = env('VITE_VAPID_PUBLIC_KEY', 'VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  const vapidSubject = env('VAPID_SUBJECT', 'mailto:contacto@el-pollon.cl');
  const hasFcm = isFcmConfigured();

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Faltan vars Supabase (URL, ANON, SERVICE_ROLE)' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sin autorización' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const jobId = body.jobId;
  if (!jobId) return res.status(400).json({ error: 'jobId requerido' });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Token inválido' });

  const { data: jobVisible, error: jobVisErr } = await userClient
    .from('ep_delivery_jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle();
  if (jobVisErr || !jobVisible) {
    return res.status(403).json({ error: 'Sin permiso para este pedido' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: offers, error: offersErr } = await admin
    .from('ep_delivery_offers')
    .select('id, driver_id, offered_fee, ep_delivery_jobs(ticket_code, customer_name, customer_address, order_total, delivery_fee)')
    .eq('job_id', jobId)
    .eq('status', 'pending');

  if (offersErr) return res.status(500).json({ error: offersErr.message });
  if (!offers?.length) {
    return res.status(200).json({ ok: true, sent: 0, fcmSent: 0, webSent: 0, reason: 'sin ofertas pendientes' });
  }

  const driverIds = [...new Set(offers.map((o) => o.driver_id).filter(Boolean))];
  const byDriver = Object.fromEntries(offers.map((o) => [o.driver_id, o]));

  let fcmSent = 0;
  let webSent = 0;
  const staleWeb = [];
  const staleFcm = [];

  if (hasFcm) {
    const { data: fcmRows } = await admin
      .from('ep_driver_fcm_tokens')
      .select('id, driver_id, token')
      .in('driver_id', driverIds);

    await Promise.all(
      (fcmRows || []).map(async (row) => {
        const offer = byDriver[row.driver_id];
        if (!offer) return;
        const job = offer.ep_delivery_jobs || {};
        const fee = offer.offered_fee ?? job.delivery_fee ?? 0;
        const ticket = ticketShort(job.ticket_code);
        const name = job.customer_name || 'Cliente';
        const title = 'El Pollón · Nuevo pedido';
        const bodyText = `Pedido Nº ${ticket} · ${name} · Delivery ${moneyCLP(fee)}`;
        try {
          const result = await sendFcm(row.token, {
            title,
            body: bodyText,
            data: {
              type: 'driver_offer',
              offerId: String(offer.id),
              jobId: String(jobId),
              deepLink: '/repartidor',
              url: '/repartidor',
              tag: `pollon-offer-${offer.id}`,
              badgeCount: '1',
            },
          });
          if (result.ok) fcmSent += 1;
          else if (result.notRegistered) staleFcm.push(row.id);
        } catch (err) {
          console.warn('[Pollón] FCM send:', err?.message || err);
        }
      }),
    );

    if (staleFcm.length) {
      await admin.from('ep_driver_fcm_tokens').delete().in('id', staleFcm);
    }
  }

  if (vapidPublic && vapidPrivate) {
    const { data: subs } = await admin
      .from('ep_driver_push_subscriptions')
      .select('id, driver_id, endpoint, p256dh, auth')
      .in('driver_id', driverIds);

    if (subs?.length) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
      await Promise.all(
        subs.map(async (sub) => {
          const offer = byDriver[sub.driver_id];
          if (!offer) return;
          const job = offer.ep_delivery_jobs || {};
          const fee = offer.offered_fee ?? job.delivery_fee ?? 0;
          const ticket = ticketShort(job.ticket_code);
          const name = job.customer_name || 'Cliente';
          const payload = JSON.stringify({
            title: 'El Pollón · Nuevo pedido',
            body: `Pedido Nº ${ticket} · ${name} · Delivery ${moneyCLP(fee)}`,
            url: '/repartidor',
            offerId: offer.id,
            jobId,
            tag: `pollon-offer-${offer.id}`,
            badgeCount: 1,
            type: 'driver_offer',
          });
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { urgency: 'high', TTL: 86400 },
            );
            webSent += 1;
          } catch (err) {
            const code = err?.statusCode;
            if (code === 404 || code === 410) staleWeb.push(sub.id);
          }
        }),
      );
      if (staleWeb.length) {
        await admin.from('ep_driver_push_subscriptions').delete().in('id', staleWeb);
      }
    }
  }

  return res.status(200).json({
    ok: true,
    sent: fcmSent + webSent,
    fcmSent,
    webSent,
    offers: offers.length,
    fcmConfigured: hasFcm,
    fcmMode: fcmModeLabel(),
    projectId: parseServiceAccount()?.project_id || null,
  });
}
