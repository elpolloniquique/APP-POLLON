import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

const WA_BG = '#0d3328';
const WA_TEXT = '#e9edef';
const WA_ACCENT = '#25d366';
const WA_LINE = 'rgba(255,255,255,0.35)';

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
<meta name="viewport" content="width=302"/>
<title>Pedido ${esc(m.ticket)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body {
    width: 80mm;
    min-height: 40mm;
    margin: 0;
    padding: 0;
    background: ${WA_BG} !important;
    color: ${WA_TEXT} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    padding: 10px 12px 14px;
  }
  .ticket { width: 100%; max-width: 72mm; margin: 0 auto; }
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
  .no-print {
    margin-top: 12px;
    text-align: center;
    font-size: 11px;
    opacity: 0.7;
  }
  /* Pantalla previa: estilo WhatsApp verde */
  @media screen {
    html, body { background: ${WA_BG}; color: ${WA_TEXT}; }
  }
  /* Impresión térmica 80mm: texto negro sobre blanco (evita hoja en blanco) */
  @media print {
    html, body {
      width: 80mm !important;
      background: #fff !important;
      color: #000 !important;
    }
    .title, .row, .section-head, .sucursal, .meta-row, .sub, .price, .delivery, .addr-line {
      color: #000 !important;
    }
    .meta-date, .accent { color: #0d5c3d !important; font-weight: 700 !important; }
    .hr { border-top-color: #000 !important; }
    .no-print { display: none !important; }
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
<p class="no-print">Cerrar después de imprimir</p>
</body>
</html>`;
}

const PRINT_FRAME_ID = 'pollon-receipt-print-root';

/** Imprime ticket 80mm (iframe + ventana de respaldo) */
export function printThermalReceipt(order, branch) {
  if (!order) throw new Error('Pedido no válido');

  const html = buildThermalReceiptHtml(order, branch);

  // Método 1: iframe oculto (más fiable en Chrome/Edge)
  try {
    let frame = document.getElementById(PRINT_FRAME_ID);
    if (frame) frame.remove();

    frame = document.createElement('iframe');
    frame.id = PRINT_FRAME_ID;
    frame.setAttribute('title', 'Imprimir pedido');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:600px;border:0;';
    document.body.appendChild(frame);

    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) throw new Error('No iframe document');

    doc.open();
    doc.write(html);
    doc.close();

    const printFrame = () => {
      setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch (e) {
          console.warn('[Pollón] print iframe:', e);
          openPrintWindow(html);
        }
      }, 500);
    };

    if (frame.contentWindow?.document?.readyState === 'complete') {
      printFrame();
    } else {
      frame.onload = printFrame;
      setTimeout(printFrame, 800);
    }
    return;
  } catch (e) {
    console.warn('[Pollón] iframe print failed:', e);
  }

  openPrintWindow(html);
}

function openPrintWindow(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer,width=400,height=700');

  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Permite ventanas emergentes para imprimir el ticket');
  }

  const cleanup = () => URL.revokeObjectURL(url);
  const trigger = () => {
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        cleanup();
      }
    }, 700);
  };
  win.addEventListener('load', trigger);
  setTimeout(trigger, 1200);
}
