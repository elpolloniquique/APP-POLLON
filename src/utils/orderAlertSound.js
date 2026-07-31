/**
 * Alertas sonoras — Web Audio (sin archivos).
 * Cocina/admin: playNewOrderAlert
 * Repartidor: playDriverOrderAlarm (máximo volumen, se repite)
 */

function scheduleTone(ctx, master, { freq, start, duration, type = 'sine', peak = 0.92 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function scheduleBell(ctx, master, freq, start, duration = 0.55, peak = 0.95) {
  scheduleTone(ctx, master, { freq, start, duration, type: 'sine', peak });
  scheduleTone(ctx, master, { freq: freq * 2.01, start, duration: duration * 0.65, type: 'sine', peak: peak * 0.35 });
  scheduleTone(ctx, master, { freq: freq * 3.02, start, duration: duration * 0.4, type: 'triangle', peak: peak * 0.15 });
}

function playPattern(ctx, volume = 0.85) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(volume, ctx.currentTime);
  master.connect(ctx.destination);

  const t = ctx.currentTime + 0.02;
  const gap = 0.11;
  const notes = [659.25, 783.99, 987.77, 1174.66];
  notes.forEach((freq, i) => {
    scheduleBell(ctx, master, freq, t + i * gap, 0.48, 0.98);
  });
  scheduleBell(ctx, master, 880, t + notes.length * gap + 0.06, 0.72, 1);
  scheduleBell(ctx, master, 1174.66, t + notes.length * gap + 0.18, 0.85, 1);
}

/** Alarma cocina / admin */
export function playNewOrderAlert() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const run = () => {
      playPattern(ctx, 0.9);
      window.setTimeout(() => { ctx.close().catch(() => {}); }, 1600);
    };
    if (ctx.state === 'suspended') ctx.resume().then(run).catch(() => {});
    else run();
  } catch {
    /* ignore */
  }
}

/**
 * Alarma repartidor a máximo volumen.
 * Se repite varias veces hasta que el conductor acepte/rechace (o se llame al stop).
 * @returns {() => void} stop
 */
export function playDriverOrderAlarm({ loops = 5 } = {}) {
  let stopped = false;
  let ctx = null;
  let timer = null;
  let count = 0;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { ctx?.close?.(); } catch { /* ignore */ }
    ctx = null;
  };

  const beat = () => {
    if (stopped || count >= loops) {
      stop();
      return;
    }
    count += 1;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      const run = () => {
        // Volumen al máximo + doble campanada agresiva
        playPattern(ctx, 1);
        window.setTimeout(() => {
          if (!stopped) playPattern(ctx, 1);
        }, 700);
        timer = window.setTimeout(() => {
          try { ctx?.close?.(); } catch { /* ignore */ }
          ctx = null;
          if (!stopped) beat();
        }, 2200);
      };
      if (ctx.state === 'suspended') ctx.resume().then(run).catch(() => {});
      else run();
    } catch {
      /* ignore */
    }
  };

  beat();
  return stop;
}

/** @deprecated Usar playNewOrderAlert */
export const playNewOrderBeep = playNewOrderAlert;
