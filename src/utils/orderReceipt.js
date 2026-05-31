import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

/** 80mm ≈ 302px — ancho ticket térmico */
const THERMAL_MM = '80mm';
const THERMAL_PX = 302;
const WIN_WIDTH = 340;

export function paymentLabel(method) {
  const m = PAYMENT_METHODS.find((p) => p.id === method);
  return m?.label || (method === 'whatsapp' ? 'WhatsApp' : method || '—');
}

function formatTicketDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

function formatTicketTime(date) {
  return new Date(date).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function getOrderReceiptMeta(order, branch) {
  const customer = order.customer || {};
  const items = order.items || [];
  const fechaBase = order.createdAt ? new Date(order.createdAt) : new Date();
  const ticket = String(order.ticketNumber || order.codigo_pedido || '001').padStart(6, '0');

  return {
    ticket,
    ticketShort: ticket.replace(/^0+/, '') || ticket,
    fechaStr: formatTicketDate(fechaBase),
    horaStr: formatTicketTime(fechaBase),
    sucursal: branch?.name || 'Pollería El Pollón',
    sucursalCity: branch?.city || '',
    sucursalPhone: branch?.phone || '',
    orderType: (order.orderType || 'delivery').toLowerCase(),
    orderTypeLabel: ORDER_TYPE_LABELS[(order.orderType || 'delivery').toLowerCase()] || 'Delivery',
    customer,
    items,
    deliveryFee: Number(order.deliveryFee) || 0,
    total: Number(order.total) || 0,
    payment: paymentLabel(order.metodo_pago),
    estado: order.estado || 'pendiente',
  };
}

function buildCustomerText(customer) {
  let msg = `Nombre:   ${customer.name || '-'}\n`;
  msg += `Teléfono: ${customer.phone || '-'}\n`;
  msg += `Dirección:\n`;
  const addr = wrapText(customer.address || '-', 32);
  msg += addr ? `${addr.split('\n').map((l) => `  ${l}`).join('\n')}\n` : '  -\n';
  if (customer.comments?.trim()) {
    msg += `Observaciones:\n`;
    msg += `${wrapText(customer.comments, 32).split('\n').map((l) => `  ${l}`).join('\n')}\n`;
  }
  return msg;
}

function buildItemsText(items) {
  if (!items.length) return 'Sin productos\n';
  let msg = '';
  items.forEach((it) => {
    const qty = it.qty ?? 1;
    msg += `◆ ${qty}x ${it.name}\n`;
    if (it.drink) msg += `${it.drink}\n`;
    if (it.bagQty > 0) msg += `Bolsa x${it.bagQty}\n`;
    if (it.notes) msg += `${it.notes}\n`;
    msg += `$${(it.total || 0).toLocaleString('es-CL')}\n\n`;
  });
  return msg;
}

function buildFooterText(m) {
  let msg = `${'─'.repeat(32)}\n`;
  msg += `TOTAL: $${m.total.toLocaleString('es-CL')}\n`;
  msg += `Pago: ${m.payment}\n`;
  if (m.orderType === 'delivery' && m.deliveryFee <= 0) {
    msg += `◆ El delivery no está incluido en este total.\n`;
  } else if (m.deliveryFee > 0) {
    msg += `Delivery: $${m.deliveryFee.toLocaleString('es-CL')}\n`;
  }
  return msg;
}

/** Texto plano — mismo formato que impresión / WhatsApp */
export function buildOrderReceiptText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

  let msg = `${m.orderTypeLabel.toUpperCase()} - POLLERÍA EL POLLÓN\n\n`;
  msg += `Sucursal: ${m.sucursal}\n`;
  msg += `${m.ticketShort}  ${m.fechaStr}  ${m.horaStr}\n`;
  msg += `${'─'.repeat(32)}\n`;
  msg += `DATOS DEL CLIENTE\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  msg += buildCustomerText(customer);
  msg += `\n${'─'.repeat(32)}\n`;
  msg += `DETALLE DEL PEDIDO\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  msg += buildItemsText(items);
  msg += buildFooterText(m);
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

function buildCustomerHtml(customer) {
  const addrHtml = wrapText(customer.address || '-', 30)
    .split('\n')
    .map((l) => `<div class="field-value block">${esc(l)}</div>`)
    .join('');

  const obsHtml = customer.comments?.trim()
    ? `<div class="field">
         <div class="field-label">Observaciones:</div>
         ${wrapText(customer.comments, 30).split('\n').map((l) => `<div class="field-value block">${esc(l)}</div>`).join('')}
       </div>`
    : '';

  return `
  <div class="field">
    <span class="field-label">Nombre:</span>
    <span class="field-value">${esc(customer.name || '-')}</span>
  </div>
  <div class="field">
    <span class="field-label">Teléfono:</span>
    <span class="field-value">${esc(customer.phone || '-')}</span>
  </div>
  <div class="field">
    <div class="field-label">Dirección:</div>
    ${addrHtml}
  </div>
  ${obsHtml}`;
}

function buildItemsHtml(items) {
  if (!items.length) return '<div class="item-empty">Sin productos</div>';

  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = [
      it.drink ? `<div class="item-sub">${esc(it.drink)}</div>` : '',
      it.bagQty > 0 ? `<div class="item-sub">Bolsa x${it.bagQty}</div>` : '',
      it.notes ? `<div class="item-sub">${esc(it.notes)}</div>` : '',
    ].join('');
    return `
    <div class="item">
      <div class="item-line">◆ ${qty}x ${esc(it.name)}</div>
      ${extras}
      <div class="item-price">$${(it.total || 0).toLocaleString('es-CL')}</div>
    </div>`;
  }).join('');
}

function buildFooterHtml(m) {
  const deliveryNote = m.orderType === 'delivery' && m.deliveryFee <= 0
    ? '<div class="note-line">◆ El delivery no está incluido en este total.</div>'
    : m.deliveryFee > 0
      ? `<div class="delivery-line">Delivery: $${m.deliveryFee.toLocaleString('es-CL')}</div>`
      : '';

  return `
  ${line()}
  <div class="total-line">TOTAL: $${m.total.toLocaleString('es-CL')}</div>
  <div class="pay-line">Pago: ${esc(m.payment)}</div>
  ${deliveryNote}`;
}

/** HTML ticket térmico 80mm — estilo impresora monocromo */
export function buildThermalReceiptHtml(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

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
  * { box-sizing: border-box; margin: 0; padding: 0; }
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
    font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
    font-size: 12px;
    line-height: 1.35;
    background: #fff;
    color: #000;
  }
  .ticket {
    width: 100%;
    padding: 8px 10px 10px;
  }
  .title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .sucursal {
    margin-bottom: 4px;
    font-size: 12px;
  }
  .sucursal strong {
    font-weight: 700;
  }
  .meta-row {
    font-size: 12px;
    margin-bottom: 2px;
    white-space: nowrap;
  }
  .hr {
    height: 0;
    border: none;
    border-top: 1px solid #000;
    margin: 8px 0;
  }
  .section-head {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 0;
  }
  .field {
    margin: 5px 0;
  }
  .field-label {
    font-weight: 400;
  }
  .field-value {
    font-weight: 700;
  }
  .field-value.block {
    display: block;
    margin-top: 1px;
  }
  .item {
    margin: 7px 0;
  }
  .item-line {
    font-weight: 400;
    word-wrap: break-word;
  }
  .item-sub {
    margin-top: 1px;
    font-weight: 400;
  }
  .item-price {
    margin-top: 2px;
    font-weight: 400;
  }
  .item-empty {
    margin: 4px 0;
    font-style: italic;
  }
  .total-line {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.02em;
    margin-bottom: 4px;
  }
  .pay-line {
    font-weight: 400;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .note-line {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
  }
  .delivery-line {
    margin-top: 2px;
    font-size: 12px;
  }
  @media screen {
    html {
      background: #e8e8e8;
    }
    body {
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
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
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="title">${esc(m.orderTypeLabel.toUpperCase())} - POLLERÍA EL POLLÓN</div>
  <div class="sucursal">Sucursal: <strong>${esc(m.sucursal)}</strong></div>
  <div class="meta-row">${esc(m.ticketShort)}&nbsp;&nbsp;${esc(m.fechaStr)}&nbsp;&nbsp;${esc(m.horaStr)}</div>

  ${line()}
  <div class="section-head">DATOS DEL CLIENTE</div>
  ${line()}

  ${buildCustomerHtml(customer)}

  ${line()}
  <div class="section-head">DETALLE DEL PEDIDO</div>
  ${line()}

  ${buildItemsHtml(items)}
  ${buildFooterHtml(m)}
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
