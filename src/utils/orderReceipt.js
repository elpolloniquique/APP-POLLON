import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

const WA_BG = '#0d3328';
const WA_TEXT = '#e9edef';
const WA_ACCENT = '#25d366';
const WA_LINE = 'rgba(255,255,255,0.35)';

/** 80mm ≈ 302px — ancho ticket térmico */
const THERMAL_MM = '80mm';
const THERMAL_PX = 302;
const WIN_WIDTH = 340;

export function paymentLabel(method) {
  const m = PAYMENT_METHODS.find((p) => p.id === method);
  return m?.label || (method === 'whatsapp' ? 'WhatsApp' : method || '—');
}

export function getOrderReceiptMeta(order, branch) {
  const customer = order.customer || {};
  const items = order.items || [];
  const fechaBase = order.createdAt ? new Date(order.createdAt) : new Date();
  const ticket = String(order.ticketNumber || order.codigo_pedido || '001').padStart(6, '0');

  return {
    ticket,
    ticketShort: ticket.replace(/^0+/, '') || ticket,
    fechaStr: fechaBase.toLocaleDateString('es-CL'),
    horaStr: fechaBase.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    sucursal: branch?.name || 'Pollería El Pollón',
    sucursalCity: branch?.city || '',
    sucursalPhone: branch?.phone || '',
    orderType: (order.orderType || 'delivery').toLowerCase(),
    orderTypeLabel: ORDER_TYPE_LABELS[(order.orderType || 'delivery').toLowerCase()] || 'DELIVERY',
    customer,
    items,
    deliveryFee: Number(order.deliveryFee) || 0,
    total: Number(order.total) || 0,
    payment: paymentLabel(order.metodo_pago),
    estado: order.estado || 'pendiente',
  };
}

/** Texto plano — mismo formato que WhatsApp */
export function buildOrderReceiptText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

  let msg = `◆ ${m.orderTypeLabel.toUpperCase()} - POLLERÍA EL POLLÓN ◆\n\n`;
  msg += `Sucursal: ${m.sucursal}\n`;
  msg += `${m.ticketShort}    ${m.fechaStr}    ${m.horaStr}\n`;
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ DATOS DEL CLIENTE\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  msg += `◆ Nombre:   ${customer.name || '-'}\n`;
  msg += `◆ Teléfono: ${customer.phone || '-'}\n`;
  const addr = wrapText(customer.address, 32);
  msg += `◆ Dirección:\n${addr ? addr.split('\n').map((l) => `   ${l}`).join('\n') : '   -'}\n\n`;
  if (customer.comments?.trim()) {
    msg += `◆ Observaciones:\n${wrapText(customer.comments, 32).split('\n').map((l) => `   ${l}`).join('\n')}\n\n`;
  }
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ DETALLE DEL PEDIDO\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  items.forEach((it) => {
    const qty = it.qty ?? 1;
    msg += `◆ ${qty}x ${it.name}\n`;
    if (it.drink) msg += `   ${it.drink}\n`;
    if (it.bagQty > 0) msg += `   Bolsa x${it.bagQty}\n`;
    if (it.notes) msg += `   ${it.notes}\n`;
    msg += `   $${(it.total || 0).toLocaleString('es-CL')}\n\n`;
  });
  if (m.deliveryFee > 0) msg += `Delivery: $${m.deliveryFee.toLocaleString('es-CL')}\n`;
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ TOTAL: $${m.total.toLocaleString('es-CL')}\n`;
  msg += `◆ Pago: ${m.payment}\n`;
  return msg;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function line() {
  return '<div class="hr"></div>';
}

/** HTML estilo burbuja WhatsApp — 80mm */
export function buildThermalReceiptHtml(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

  const itemsHtml = items.length
    ? items.map((it) => {
        const qty = it.qty ?? 1;
        const extras = [
          it.drink ? `<div class="sub">${esc(it.drink)}</div>` : '',
          it.bagQty > 0 ? `<div class="sub">Bolsa x${it.bagQty}</div>` : '',
          it.notes ? `<div class="sub">${esc(it.notes)}</div>` : '',
        ].join('');
        return `
        <div class="item">
          <div class="row">◆ ${qty}x ${esc(it.name)}</div>
          ${extras}
          <div class="price">$${(it.total || 0).toLocaleString('es-CL')}</div>
        </div>`;
      }).join('')
    : '<div class="row">Sin productos</div>';

  const addrHtml = wrapText(customer.address || '-', 30)
    .split('\n')
    .map((l) => `<div class="addr-line">${esc(l)}</div>`)
    .join('');

  const obsHtml = customer.comments?.trim()
    ? `<div class="row">◆ Observaciones:</div>
       ${wrapText(customer.comments, 30).split('\n').map((l) => `<div class="sub">${esc(l)}</div>`).join('')}`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${THERMAL_PX}"/>
<title>Pedido ${esc(m.ticket)}</title>
<style>
  @page {
    size: ${THERMAL_MM} auto;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html {
    width: ${THERMAL_MM};
    max-width: ${THERMAL_MM};
    min-width: ${THERMAL_MM};
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    width: ${THERMAL_MM};
    max-width: ${THERMAL_MM};
    min-width: ${THERMAL_MM};
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    background: ${WA_BG};
    color: ${WA_TEXT};
  }
  .ticket {
    width: 100%;
    padding: 10px 10px 12px;
  }
  .title {
    text-align: center;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.3px;
    margin-bottom: 8px;
  }
  .sucursal { margin-bottom: 6px; }
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .meta-ticket { font-weight: 600; }
  .meta-date { color: ${WA_ACCENT}; font-weight: 600; }
  .hr {
    height: 0;
    border: none;
    border-top: 1px solid ${WA_LINE};
    margin: 10px 0;
  }
  .section-head {
    font-weight: 700;
    margin-bottom: 6px;
  }
  .row { margin: 4px 0; word-wrap: break-word; }
  .accent { color: ${WA_ACCENT}; font-weight: 600; }
  .addr-line { padding-left: 14px; margin: 2px 0; }
  .sub { padding-left: 14px; margin: 2px 0; opacity: 0.95; }
  .item { margin: 8px 0; }
  .price { padding-left: 14px; margin-top: 4px; font-weight: 600; }
  .delivery { margin: 6px 0; }
  .total-block { margin-top: 4px; }
  .total-block .row { font-weight: 700; font-size: 14px; }
  .print-hint {
    display: none;
  }
  @media screen {
    html {
      background: #1a1a1a;
    }
    body {
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    }
  }
  @media print {
    @page {
      size: ${THERMAL_MM} auto;
      margin: 0;
    }
    html, body {
      width: ${THERMAL_MM} !important;
      max-width: ${THERMAL_MM} !important;
      min-width: ${THERMAL_MM} !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      box-shadow: none !important;
    }
    .ticket { padding: 6px 8px 8px !important; }
    .title, .row, .section-head, .sucursal, .meta-row, .sub, .price, .delivery, .addr-line {
      color: #000 !important;
    }
    .meta-date, .accent { color: #0d5c3d !important; font-weight: 700 !important; }
    .hr { border-top-color: #000 !important; }
    .print-hint { display: none !important; }
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="title">◆ ${esc(m.orderTypeLabel.toUpperCase())} - POLLERÍA EL POLLÓN ◆</div>
  <div class="sucursal">Sucursal: ${esc(m.sucursal)}</div>
  <div class="meta-row">
    <span class="meta-ticket">${esc(m.ticketShort)}</span>
    <span class="meta-date">${esc(m.fechaStr)}</span>
    <span>${esc(m.horaStr)}</span>
  </div>

  ${line()}
  <div class="section-head">◆ DATOS DEL CLIENTE</div>
  ${line()}

  <div class="row">◆ Nombre: ${esc(customer.name || '-')}</div>
  <div class="row">◆ Teléfono: <span class="accent">${esc(customer.phone || '-')}</span></div>
  <div class="row">◆ Dirección:</div>
  ${addrHtml}
  ${obsHtml}

  ${line()}
  <div class="section-head">◆ DETALLE DEL PEDIDO</div>
  ${line()}

  ${itemsHtml}
  ${m.deliveryFee > 0 ? `<div class="delivery">Delivery: $${m.deliveryFee.toLocaleString('es-CL')}</div>` : ''}

  ${line()}
  <div class="total-block">
    <div class="row">◆ TOTAL: $${m.total.toLocaleString('es-CL')}</div>
    <div class="row">◆ Pago: ${esc(m.payment)}</div>
  </div>
</div>
</body>
</html>`;
}

let printWinRef = null;

/** Imprime ticket 80mm en ventana compacta (tamaño rollo térmico) */
export function printThermalReceipt(order, branch) {
  if (!order) throw new Error('Pedido no válido');
  const html = buildThermalReceiptHtml(order, branch);
  openCompactPrintWindow(html);
}

function openCompactPrintWindow(html) {
  if (printWinRef && !printWinRef.closed) {
    try {
      printWinRef.close();
    } catch {
      /* ignore */
    }
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const left = Math.max(0, Math.round((window.screen.width - WIN_WIDTH) / 2));
  const top = Math.max(0, 40);
  const features = [
    `width=${WIN_WIDTH}`,
    'height=480',
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  const win = window.open(url, 'pollon_ticket_print', features);

  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Permite ventanas emergentes para imprimir el ticket');
  }

  printWinRef = win;

  const fitWindowToTicket = () => {
    try {
      const doc = win.document;
      const contentH = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        320
      );
      const chrome = win.outerHeight - win.innerHeight;
      const targetH = Math.min(contentH + chrome + 16, 720);
      win.resizeTo(WIN_WIDTH, targetH);
    } catch {
      win.resizeTo(WIN_WIDTH, 480);
    }
  };

  const runPrint = () => {
    fitWindowToTicket();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn('[Pollón] print:', e);
      }
      URL.revokeObjectURL(url);
    }, 450);
  };

  win.addEventListener('load', runPrint);
  setTimeout(runPrint, 900);
}
