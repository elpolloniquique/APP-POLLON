/**
 * Alerta sonora para nuevo pedido — Web Audio (sin archivos externos).
 * Campanada clara y audible para cocina / panel admin.
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

function scheduleBell(ctx, master, freq, start, duration = 0.55) {
  scheduleTone(ctx, master, { freq, start, duration, type: 'sine', peak: 0.88 });
  scheduleTone(ctx, master, { freq: freq * 2.01, start, duration: duration * 0.65, type: 'sine', peak: 0.22 });
  scheduleTone(ctx, master, { freq: freq * 3.02, start, duration: duration * 0.4, type: 'triangle', peak: 0.08 });
}

function playPattern(ctx) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, ctx.currentTime);
  master.connect(ctx.destination);

  const t = ctx.currentTime + 0.02;
  const gap = 0.11;

  /* Arpeggio ascendente — tono de POS / cocina profesional */
  const notes = [659.25, 783.99, 987.77, 1174.66]; /* E5 G5 B5 D6 */
  notes.forEach((freq, i) => {
    scheduleBell(ctx, master, freq, t + i * gap, 0.48);
  });

  /* Refuerzo final (más largo y audible) */
  scheduleBell(ctx, master, 880, t + notes.length * gap + 0.06, 0.72);
  scheduleBell(ctx, master, 1174.66, t + notes.length * gap + 0.18, 0.85);
}

export function playNewOrderAlert() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const run = () => {
      playPattern(ctx);
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1600);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(run).catch(() => {});
    } else {
      run();
    }
  } catch {
    /* navegador sin audio */
  }
}

/** @deprecated Usar playNewOrderAlert */
export const playNewOrderBeep = playNewOrderAlert;
