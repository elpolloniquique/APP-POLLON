/** Cliente Evolution API (Baileys) — solo server-side */

import { env } from './supabaseAdmin.js';

function baseUrl() {
  return String(env('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
}

function apiKey() {
  return env('EVOLUTION_API_KEY');
}

export function evolutionConfigured() {
  return Boolean(baseUrl() && apiKey());
}

async function evoFetch(path, { method = 'GET', body } = {}) {
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: apiKey(),
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.message || json?.error || json?.raw || `Evolution ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export async function ensureInstance(instanceName, webhookUrl) {
  try {
    await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  } catch {
    await evoFetch('/instance/create', {
      method: 'POST',
      body: {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      },
    });
  }

  if (webhookUrl) {
    try {
      await evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: {
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: false,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        },
      });
    } catch {
      try {
        await evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          body: {
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          },
        });
      } catch {
        /* webhook opcional: el usuario puede pegarlo a mano en Evolution */
      }
    }
  }

  return connectInstance(instanceName);
}

export async function connectInstance(instanceName) {
  const data = await evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
  return normalizeQr(data);
}

export async function connectionState(instanceName) {
  try {
    const data = await evoFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    return normalizeState(data);
  } catch {
    try {
      const data = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
      const row = Array.isArray(data) ? data[0] : (data?.instance || data);
      return normalizeState(row);
    } catch {
      return { state: 'close', connected: false, phone: null, raw: null };
    }
  }
}

export async function logoutInstance(instanceName) {
  try {
    await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
  } catch {
    await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'PUT' });
  }
}

export async function deleteInstance(instanceName) {
  try {
    await evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}

export async function sendText(instanceName, phone, text) {
  if (!text || !phone) return { skipped: true };
  const number = String(phone).replace(/\D/g, '');
  return evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      text: String(text),
    },
  });
}

function normalizeQr(data) {
  const qr =
    data?.qrcode?.base64
    || data?.base64
    || data?.qr
    || data?.qrcode
    || null;
  const code = data?.qrcode?.code || data?.code || null;
  const pairingCode = data?.pairingCode || data?.pairing_code || null;
  return {
    qr: typeof qr === 'string' ? qr : null,
    code,
    pairingCode,
    raw: data,
  };
}

function normalizeState(data) {
  const inst = data?.instance || data?.instanceInfo || data;
  const state = String(
    inst?.state
    || inst?.status
    || data?.state
    || data?.status
    || data?.connectionStatus
    || '',
  ).toLowerCase();
  const connected = ['open', 'connected', 'online'].includes(state);
  const phone =
    inst?.ownerJid
    || inst?.wuid
    || inst?.owner
    || data?.ownerJid
    || data?.phone
    || null;
  return { state: state || 'close', connected, phone: phone ? String(phone) : null, raw: data };
}

/** Extrae texto + teléfono de webhook Evolution (v1/v2). */
export function parseInboundWebhook(body) {
  const event = String(body?.event || body?.type || '').toLowerCase();
  const instance = body?.instance || body?.instanceName || body?.data?.instance || null;
  const data = body?.data || body?.message || body;

  if (event && !event.includes('message') && event !== 'messages.upsert' && event !== 'messages_upsert') {
    return { kind: event || 'other', instance, fromMe: true, phone: null, text: '', pushName: '', messageId: null };
  }

  const key = data?.key || data?.message?.key || {};
  const fromMe = Boolean(key.fromMe);
  const remoteJid = key.remoteJid || data?.remoteJid || '';
  if (String(remoteJid).includes('@g.us')) {
    return { kind: 'group', instance, fromMe: true, phone: null, text: '', pushName: '', messageId: key.id || null };
  }

  const msg = data?.message || data?.messages?.[0]?.message || {};
  const text =
    msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || msg.documentMessage?.caption
    || data?.messageType === 'conversation' && data?.message?.conversation
    || data?.text
    || data?.body
    || '';

  return {
    kind: 'message',
    instance,
    fromMe,
    remoteJid,
    phone: remoteJid,
    text: String(text || '').trim(),
    pushName: data?.pushName || data?.notifyName || '',
    messageId: key.id || data?.id || null,
    timestamp: data?.messageTimestamp || data?.timestamp || null,
  };
}
