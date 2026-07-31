/**
 * Alerta de voz en vivo (Web Speech API) — cola secuencial, es-CL.
 */

const STORAGE_KEY = 'ep_live_voice_alert_on';

export function loadVoiceAlertEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v == null) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export function saveVoiceAlertEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function firstName(fullName) {
  const n = String(fullName || 'Repartidor').trim();
  return n.split(/\s+/)[0] || 'Repartidor';
}

/** Resume items de un pedido en frase corta para TTS */
export function summarizeOrderItems(items = []) {
  if (!items.length) return 'pedido sin detalle';
  return items
    .map((it) => {
      const name = String(it.name || '').trim();
      const qty = Number(it.qty) || 1;
      return qty > 1 ? `${qty} ${name}` : name;
    })
    .filter(Boolean)
    .join(' y ');
}

/**
 * "Repartidor Akiles llega en 5 minutos. Pedido 01, Oferta…. Pedido 02, …"
 */
export function buildApproachingSpeech({ driverName, etaMin = 5, orders = [] }) {
  const name = firstName(driverName);
  const parts = [`Repartidor ${name} llega en ${etaMin} minutos`];
  if (!orders.length) {
    parts.push('con pedidos pendientes de recojo');
  } else {
    orders.forEach((o, i) => {
      const num = String(o.index ?? i + 1).padStart(2, '0');
      const detail = summarizeOrderItems(o.items);
      parts.push(`Pedido ${num}, ${detail}`);
    });
  }
  return `${parts.join('. ')}.`;
}

/** "Repartidor Akiles llegó, tiene 3 pedidos." */
export function buildArrivedSpeech({ driverName, orderCount }) {
  const name = firstName(driverName);
  const n = Math.max(0, Number(orderCount) || 0);
  const label = n === 1 ? '1 pedido' : `${n} pedidos`;
  return `Repartidor ${name} llegó, tiene ${label}.`;
}

/** Firma estable del viaje (cambia si acepta nuevos pedidos) */
export function tripSignature(driverId, assignmentIds = []) {
  const ids = [...assignmentIds].map(String).sort().join(',');
  return `${driverId}:${ids}`;
}

let queue = Promise.resolve();

/** Algunos navegadores exigen un gesto del usuario antes de hablar */
export function unlockSpeech() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const warm = new SpeechSynthesisUtterance(' ');
    warm.volume = 0;
    warm.lang = 'es-CL';
    window.speechSynthesis.speak(warm);
  } catch {
    /* ignore */
  }
}

function pickSpanishVoice() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return (
      voices.find((v) => /es(-|_)CL/i.test(v.lang))
      || voices.find((v) => /es(-|_)MX/i.test(v.lang))
      || voices.find((v) => /es(-|_)ES/i.test(v.lang))
      || voices.find((v) => /^es/i.test(v.lang))
      || null
    );
  } catch {
    return null;
  }
}

/**
 * Encola una frase; se reproducen en orden (varios repartidores).
 * @returns {Promise<void>}
 */
export function speakAlert(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  const phrase = String(text || '').trim();
  if (!phrase) return Promise.resolve();

  queue = queue.then(() => new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = 'es-CL';
    utter.rate = 0.95;
    utter.pitch = 1;
    utter.volume = 1;
    const voice = pickSpanishVoice();
    if (voice) utter.voice = voice;

    const done = () => resolve();
    utter.onend = done;
    utter.onerror = done;

    try {
      window.speechSynthesis.speak(utter);
    } catch {
      done();
    }
  })).catch(() => {});

  return queue;
}

export function stopVoiceAlerts() {
  queue = Promise.resolve();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}
