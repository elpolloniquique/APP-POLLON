import { buildOrderReceiptText } from './orderReceipt';

const STORAGE_PREFIX = 'pollon_thermal_printer_v1_';

export function getBranchPrinterConfig(branch) {
  const fromBranch = {
    enabled: branch?.thermalNetworkPrintEnabled === true,
    ip: (branch?.thermalPrinterIp || '').trim(),
    port: Number(branch?.thermalPrinterPort) || 9100,
    bridgeUrl: (branch?.thermalPrintBridgeUrl || '').trim().replace(/\/$/, ''),
  };

  if (!branch?.id) return fromBranch;

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${branch.id}`);
    if (raw) {
      const stored = JSON.parse(raw);
      return { ...fromBranch, ...stored };
    }
  } catch {
    /* ignore */
  }

  return fromBranch;
}

export function saveBranchPrinterConfigLocal(branchId, config) {
  if (!branchId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${branchId}`, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function isMobileOrTabletForPrint() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 1200;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return ua || (coarse && narrow);
}

/** Red WiFi + puente local → ESC/POS (PC, tablet o móvil) con márgenes y corte */
export function shouldUseNetworkPrint(printerConfig) {
  if (!printerConfig?.enabled) return false;
  if (!printerConfig.ip) return false;
  if (!printerConfig.bridgeUrl) return false;
  return true;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Líneas en blanco arriba/abajo y antes del corte (80mm térmica) */
const FEED_TOP_LINES = 1;
const FEED_BOTTOM_LINES = 1;
const FEED_CUT_LINES = 5;

function escInit() {
  return new Uint8Array([0x1b, 0x40]);
}

/** ESC d n — avanza n líneas (separación entre tickets) */
function escFeedLines(n) {
  const lines = Math.min(255, Math.max(0, n));
  return new Uint8Array([0x1b, 0x64, lines]);
}

/** GS V 66 n — avanza n líneas y corte parcial en posición de cuchilla */
function escFeedAndCut(lines = FEED_CUT_LINES) {
  const n = Math.min(255, Math.max(1, lines));
  return new Uint8Array([0x1d, 0x56, 0x42, n]);
}

/** Ticket ESC/POS 80mm — mismo texto + márgenes + expulsión + corte */
export function buildEscPosReceipt(order, branch) {
  const text = buildOrderReceiptText(order, branch);
  const encoder = new TextEncoder();
  const parts = [
    escInit(),
    escFeedLines(FEED_TOP_LINES),
    encoder.encode(text),
    escFeedLines(FEED_BOTTOM_LINES),
    escFeedAndCut(FEED_CUT_LINES),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((p) => {
    out.set(p, offset);
    offset += p.length;
  });
  return out;
}

export async function testNetworkPrinter(config) {
  if (!config?.bridgeUrl) {
    throw new Error('Indica la URL del puente local (ej. http://192.168.1.86:3009)');
  }
  if (!config?.ip) {
    throw new Error('Indica la IP de la impresora térmica');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const health = await fetch(`${config.bridgeUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!health.ok) throw new Error('El puente local no respondió correctamente');

    const res = await fetch(`${config.bridgeUrl}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ ip: config.ip, port: config.port || 9100 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo conectar con la impresora por IP');
    }
    return data.message || 'Impresora detectada y conectada correctamente';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado. ¿Estás en la misma red WiFi del local?');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function printViaNetwork(order, branch, config) {
  if (!config?.bridgeUrl) {
    throw new Error(
      'Impresión WiFi no configurada. Ve a Admin → Configuración e indica IP de impresora y URL del puente local.',
    );
  }
  if (!config?.ip) {
    throw new Error('Falta la IP de la impresora térmica en Configuración.');
  }

  const payload = bytesToBase64(buildEscPosReceipt(order, branch));
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${config.bridgeUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        ip: config.ip,
        port: config.port || 9100,
        data: payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo imprimir por red');
    }
    return true;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La impresora no respondió a tiempo. Revisa WiFi e IP.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Red WiFi configurada → ESC/POS; si no, ventana HTML + window.print() */
export async function printThermalReceiptSmart(order, branch) {
  if (!order) throw new Error('Pedido no válido');
  const printerConfig = getBranchPrinterConfig(branch);
  if (shouldUseNetworkPrint(printerConfig)) {
    await printViaNetwork(order, branch, printerConfig);
    return;
  }
  const { printThermalReceipt } = await import('./orderReceipt');
  printThermalReceipt(order, branch);
}
