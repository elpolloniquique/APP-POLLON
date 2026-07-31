/**
 * Vercel Serverless — envía Web Push a repartidores con oferta pendiente de un job.
 * POST /api/notify-driver-offers
 * Body: { jobId: string }
 * Auth: Bearer <supabase access token> (staff de despacho)
 *
 * Env (Vercel):
 *   VITE_SUPABASE_URL o SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY o SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (mailto:...)
 */
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

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

function env(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = env('VITE_VAPID_PUBLIC_KEY', 'VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  const vapidSubject = env('VAPID_SUBJECT', 'mailto:contacto@el-pollon.cl');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Faltan vars Supabase (URL, ANON, SERVICE_ROLE)' });
  }
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'Faltan VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Sin autorización' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const jobId = body.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId requerido' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Staff debe poder leer el job (RLS). Si no, 403.
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

  if (offersErr) {
    return res.status(500).json({ error: offersErr.message });
  }
  if (!offers?.length) {
    return res.status(200).json({ ok: true, sent: 0, reason: 'sin ofertas pendientes' });
  }

  const driverIds = [...new Set(offers.map((o) => o.driver_id).filter(Boolean))];
  const { data: subs, error: subsErr } = await admin
    .from('ep_driver_push_subscriptions')
    .select('id, driver_id, endpoint, p256dh, auth')
    .in('driver_id', driverIds);

  if (subsErr) {
    return res.status(500).json({ error: subsErr.message });
  }
  if (!subs?.length) {
    return res.status(200).json({ ok: true, sent: 0, reason: 'sin suscripciones push' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const byDriver = Object.fromEntries(offers.map((o) => [o.driver_id, o]));
  let sent = 0;
  const stale = [];

  await Promise.all(
    subs.map(async (sub) => {
      const offer = byDriver[sub.driver_id];
      if (!offer) return;
      const job = offer.ep_delivery_jobs || {};
      const fee = offer.offered_fee ?? job.delivery_fee ?? 0;
      const ticket = ticketShort(job.ticket_code);
      const name = job.customer_name || 'Cliente';
      const payload = JSON.stringify({
        title: 'Nuevo pedido — El Pollón',
        body: `Pedido Nº ${ticket} · ${name} · Delivery ${moneyCLP(fee)}`,
        url: '/repartidor',
        offerId: offer.id,
        jobId,
        tag: `pollon-offer-${offer.id}`,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { urgency: 'high', TTL: 60 }
        );
        sent += 1;
      } catch (err) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          stale.push(sub.id);
        }
        console.warn('[notify-driver-offers] push fail', code || err?.message);
      }
    })
  );

  if (stale.length) {
    await admin.from('ep_driver_push_subscriptions').delete().in('id', stale);
  }

  return res.status(200).json({ ok: true, sent, offers: offers.length, subscriptions: subs.length });
}
