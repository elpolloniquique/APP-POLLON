import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

/** 80mm ≈ 302px — ancho ticket térmico */
const THERMAL_MM = '80mm';
const THERMAL_PX = 302;
const WIN_WIDTH = 340;
const RECEIPT_RULE = '--------------------------';

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
  const subtotal = Number(order.subtotal) || items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const total = Number(order.total) || subtotal;

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
    subtotal,
    deliveryFee: Number(order.deliveryFee) || 0,
    total,
    payment: paymentLabel(order.metodo_pago),
    estado: order.estado || 'pendiente',
  };
}

/** Líneas extra del ítem: bebidas, bolsa, notas */
function getItemExtraLines(item) {
  const lines = [];

  if (item.drinks?.length) {
    const list = item.drinks.filter(Boolean);
    if (list.length === 1) lines.push(list[0]);
    else list.forEach((d, i) => lines.push(`#${i + 1}: ${d}`));
  } else if (item.drink?.trim()) {
    const parts = item.drink.split(' · ').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1 && !/^#\d+:/.test(parts[0])) lines.push(parts[0]);
    else lines.push(...parts);
  }

  if (item.bagQty > 0) lines.push(`Bolsa x${item.bagQty}`);
  if (item.notes?.trim()) lines.push(item.notes.trim());

  return lines;
}

function formatMoneyPlain(n) {
  return `$${(Number(n) || 0).toLocaleString('es-CL')}`;
}

function buildDeliveryFooterLines(m) {
  if (m.orderType === 'delivery' && m.deliveryFee <= 0) {
    return ['◆ El delivery no está incluido en este total.'];
  }
  if (m.deliveryFee > 0) {
    return [`Delivery: ${formatMoneyPlain(m.deliveryFee)}`];
  }
  return [];
}

function buildCustomerPlain(customer) {
  const lines = [];
  lines.push(`◆ Nombre:   ${customer.name || '-'}`);
  lines.push(`◆ Teléfono: ${customer.phone || '-'}`);
  lines.push('◆ Dirección:');
  const addr = wrapText(customer.address || '-', 30);
  if (addr) {
    addr.split('\n').forEach((l) => lines.push(`  ${l}`));
  } else {
    lines.push('  -');
  }
  if (customer.comments?.trim()) {
    lines.push('◆ Observaciones:');
    wrapText(customer.comments, 30).split('\n').forEach((l) => lines.push(`  ${l}`));
  }
  return lines.join('\n');
}

function buildCustomerWhatsApp(customer) {
  const lines = [];
  lines.push(`◆ Nombre:   *${customer.name || '-'}*`);
  lines.push(`◆ Teléfono: *${customer.phone || '-'}*`);
  lines.push('◆ Dirección:');
  const addr = wrapText(customer.address || '-', 30);
  if (addr) {
    addr.split('\n').forEach((l) => lines.push(`*${l}*`));
  } else {
    lines.push('*-*');
  }
  if (customer.comments?.trim()) {
    lines.push('◆ Observaciones:');
    wrapText(customer.comments, 30).split('\n').forEach((l) => lines.push(`*${l}*`));
  }
  return lines.join('\n');
}

function buildItemsPlain(items) {
  if (!items.length) return 'Sin productos';
  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = getItemExtraLines(it);
    const block = [
      `◆ ${qty}x ${it.name}`,
      ...extras,
      formatMoneyPlain(it.total || 0),
      '',
    ];
    return block.join('\n');
  }).join('\n');
}

function buildItemsWhatsApp(items) {
  if (!items.length) return 'Sin productos';
  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = getItemExtraLines(it);
    const block = [
      `◆ *${qty}x* ${it.name}`,
      ...extras,
      `*${formatMoneyPlain(it.total || 0)}*`,
      '',
    ];
    return block.join('\n');
  }).join('\n');
}

function buildReceiptCore(m, { customerBlock, itemsBlock, footerExtra = [] }) {
  const footer = [
    RECEIPT_RULE,
    `TOTAL: ${formatMoneyPlain(m.total)}`,
    `Pago: ${m.payment}`,
    ...footerExtra,
  ].join('\n');

  return [
    `${m.orderTypeLabel.toUpperCase()} - POLLERÍA EL POLLÓN`,
    '',
    `Sucursal: ${m.sucursal}`,
    `${m.ticketShort}  ${m.fechaStr}  ${m.horaStr}`,
    RECEIPT_RULE,
    'DATOS DEL CLIENTE',
    RECEIPT_RULE,
    '',
    customerBlock,
    '',
    RECEIPT_RULE,
    'DETALLE DEL PEDIDO',
    RECEIPT_RULE,
    '',
    itemsBlock,
    footer,
  ].join('\n');
}

/** Texto plano — impresión térmica / copiar */
export function buildOrderReceiptText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  return buildReceiptCore(m, {
    customerBlock: buildCustomerPlain(m.customer),
    itemsBlock: buildItemsPlain(m.items),
    footerExtra: buildDeliveryFooterLines(m),
  });
}

/** WhatsApp — misma estructura con negritas */
export function buildOrderReceiptWhatsAppText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const header = [
    `*${m.orderTypeLabel.toUpperCase()} - POLLERÍA EL POLLÓN*`,
    '',
    `Sucursal: *${m.sucursal}*`,
    `${m.ticketShort}  ${m.fechaStr}  ${m.horaStr}`,
    RECEIPT_RULE,
    '*DATOS DEL CLIENTE*',
    RECEIPT_RULE,
    '',
    buildCustomerWhatsApp(m.customer),
    '',
    RECEIPT_RULE,
    '*DETALLE DEL PEDIDO*',
    RECEIPT_RULE,
    '',
    buildItemsWhatsApp(m.items),
    RECEIPT_RULE,
    `*TOTAL: ${formatMoneyPlain(m.total)}*`,
    `Pago: ${m.payment}`,
    ...buildDeliveryFooterLines(m),
  ].join('\n');
  return header;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ruleHtml() {
  return `<div class="hr" aria-hidden="true">${RECEIPT_RULE}</div>`;
}

function buildCustomerHtml(customer) {
  const addrLines = wrapText(customer.address || '-', 28)
    .split('\n')
    .map((l) => `<div class="field-value field-value--indent">${esc(l)}</div>`)
    .join('');

  const obsHtml = customer.comments?.trim()
    ? `<div class="field field--block">
         <div class="field-head"><span class="bullet">◆</span> Observaciones:</div>
         ${wrapText(customer.comments, 28).split('\n').map((l) => `<div class="field-value field-value--indent">${esc(l)}</div>`).join('')}
       </div>`
    : '';

  return `
  <div class="field">
    <span class="bullet">◆</span>
    <span class="field-label">Nombre:</span>
    <span class="field-value">${esc(customer.name || '-')}</span>
  </div>
  <div class="field">
    <span class="bullet">◆</span>
    <span class="field-label">Teléfono:</span>
    <span class="field-value">${esc(customer.phone || '-')}</span>
  </div>
  <div class="field field--block">
    <div class="field-head"><span class="bullet">◆</span> Dirección:</div>
    ${addrLines}
  </div>
  ${obsHtml}`;
}

function buildItemsHtml(items) {
  if (!items.length) return '<div class="item-empty">Sin productos</div>';

  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = getItemExtraLines(it)
      .map((line) => `<div class="item-sub">${esc(line)}</div>`)
      .join('');
    return `
    <div class="item">
      <div class="item-line"><span class="bullet">◆</span> <strong class="item-qty">${qty}x</strong> ${esc(it.name)}</div>
      ${extras}
      <div class="item-price">${formatMoneyPlain(it.total || 0)}</div>
    </div>`;
  }).join('');
}

function buildFooterHtml(m) {
  const deliveryNote = buildDeliveryFooterLines(m)
    .map((line) => `<div class="note-line">${esc(line)}</div>`)
    .join('');

  return `
  ${ruleHtml()}
  <div class="total-line">TOTAL: ${formatMoneyPlain(m.total)}</div>
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
    line-height: 1.38;
    background: #fff;
    color: #000;
  }
  .ticket {
    width: 100%;
    padding: 8px 10px 12px;
  }
  .title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    margin-bottom: 6px;
    line-height: 1.25;
  }
  .sucursal {
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 1.35;
  }
  .sucursal strong {
    font-weight: 700;
  }
  .meta-row {
    font-size: 12px;
    margin-bottom: 2px;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .hr {
    margin: 7px 0;
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    color: #000;
    user-select: none;
  }
  .section-head {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    line-height: 1.2;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 3px;
    margin: 4px 0;
    line-height: 1.35;
  }
  .field--block {
    display: block;
    margin: 5px 0;
  }
  .field-head {
    margin-bottom: 1px;
    font-weight: 400;
  }
  .bullet {
    flex-shrink: 0;
    margin-right: 1px;
  }
  .field-label {
    font-weight: 400;
    margin-right: 3px;
  }
  .field-value {
    font-weight: 700;
    word-break: break-word;
  }
  .field-value--indent {
    display: block;
    padding-left: 1.15em;
    margin-top: 1px;
    font-weight: 700;
  }
  .item {
    margin: 8px 0;
  }
  .item-line {
    font-weight: 400;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }
  .item-qty {
    font-weight: 700;
  }
  .item-sub {
    margin-top: 1px;
    padding-left: 1.15em;
    font-weight: 400;
    line-height: 1.35;
  }
  .item-price {
    margin-top: 3px;
    padding-left: 1.15em;
    font-weight: 700;
    font-size: 12px;
  }
  .item-empty {
    margin: 4px 0;
    font-style: italic;
  }
  .total-line {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.01em;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .pay-line {
    font-weight: 400;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .note-line {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
  }
  @media screen {
    html { background: #ececec; }
    body { box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18); }
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
    .ticket { padding: 6px 8px 10px !important; }
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="title">${esc(m.orderTypeLabel.toUpperCase())} - POLLERÍA EL POLLÓN</div>
  <div class="sucursal">Sucursal: <strong>${esc(m.sucursal)}</strong></div>
  <div class="meta-row">${esc(m.ticketShort)}&nbsp;&nbsp;${esc(m.fechaStr)}&nbsp;&nbsp;${esc(m.horaStr)}</div>

  ${ruleHtml()}
  <div class="section-head">DATOS DEL CLIENTE</div>
  ${ruleHtml()}

  ${buildCustomerHtml(customer)}

  ${ruleHtml()}
  <div class="section-head">DETALLE DEL PEDIDO</div>
  ${ruleHtml()}

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
        320,
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
