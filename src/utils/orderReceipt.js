import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

/** 80mm ≈ 302px — ancho ticket térmico */
const THERMAL_MM = '80mm';
const THERMAL_PX = 302;
/**
 * Ventana compacta para el ticket.
 * Mín. ~420×560: el diálogo nativo de Chrome (Destino / Imprimir / Cancelar)
 * se recorta si la popup es más estrecha o baja (p. ej. 340×480).
 */
const WIN_WIDTH = 420;
const WIN_HEIGHT = 560;
const RECEIPT_RULE = '--------------------------------';
const RECEIPT_BULLET = '♦';
const ESCPOS_BULLET = '*';

function formatDistanceKm(km) {
  if (km == null || !Number.isFinite(Number(km))) return '';
  return Number(km).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function brandTitle(orderTypeLabel) {
  return `${String(orderTypeLabel || 'Delivery').toUpperCase()} - POLLERÍA EL POLLÓN`;
}

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
  const deliveryFee = Number(order.deliveryFee) || 0;
  const storedTotal = Number(order.total) || 0;
  const total = deliveryFee > 0
    ? Math.max(storedTotal, subtotal + deliveryFee)
    : (storedTotal || subtotal);

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
    deliveryFee,
    deliveryDistanceKm: order.deliveryDistanceKm != null ? Number(order.deliveryDistanceKm) : null,
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

function buildDeliveryFooterLines(m, bullet = RECEIPT_BULLET) {
  if (m.orderType === 'delivery' && m.deliveryFee <= 0) {
    return [`${bullet} El delivery no está incluido en este total.`];
  }
  return [];
}

function padMoneyRow(label, amount, width = 32) {
  const money = formatMoneyPlain(amount);
  const gap = Math.max(1, width - label.length - money.length);
  return `${label}${' '.repeat(gap)}${money}`;
}

function buildTotalsPlain(m, bullet = RECEIPT_BULLET) {
  const lines = [RECEIPT_RULE];
  if (m.deliveryFee > 0) {
    lines.push(padMoneyRow('Subtotal', m.subtotal));
    const dist = m.deliveryDistanceKm != null ? ` (${formatDistanceKm(m.deliveryDistanceKm)} km)` : '';
    lines.push(padMoneyRow(`Delivery${dist}`, m.deliveryFee));
    lines.push(RECEIPT_RULE);
  }
  lines.push(padMoneyRow('TOTAL', m.total));
  lines.push(`Pago: ${String(m.payment || '').toUpperCase()}`);
  lines.push(...buildDeliveryFooterLines(m, bullet));
  return lines.join('\n');
}

function buildCustomerPlain(customer, bullet = RECEIPT_BULLET) {
  const lines = [];
  lines.push(`${bullet} Nombre: ${customer.name || '-'}`);
  lines.push(`${bullet} Teléfono: ${customer.phone || '-'}`);
  lines.push(`${bullet} Dirección:`);
  const addr = wrapText(customer.address || '-', 30);
  if (addr) {
    addr.split('\n').forEach((l) => lines.push(`  ${l}`));
  } else {
    lines.push('  -');
  }
  if (customer.comments?.trim()) {
    lines.push(`${bullet} Observaciones:`);
    wrapText(customer.comments, 30).split('\n').forEach((l) => lines.push(`  ${l}`));
  }
  return lines.join('\n');
}

function buildItemsPlain(items, bullet = RECEIPT_BULLET) {
  if (!items.length) return 'Sin productos';
  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = getItemExtraLines(it).map((l) => `  ${l}`);
    const block = [
      `${bullet} ${qty}x ${it.name}`,
      ...extras,
      `  ${formatMoneyPlain(it.total || 0)}`,
      '',
    ];
    return block.join('\n');
  }).join('\n');
}

function buildReceiptCore(m, { customerBlock, itemsBlock, footerExtra = [], compact = false, bullet = RECEIPT_BULLET }) {
  const footer = [
    buildTotalsPlain(m, bullet),
    ...footerExtra,
  ].filter(Boolean).join('\n');

  const header = [
    brandTitle(m.orderTypeLabel),
    compact ? null : '',
    `CODIGO DE SEGUIMIENTO: ${m.ticket}`,
    `Pedido: ${m.ticket}  ${m.fechaStr}  ${m.horaStr}`,
    RECEIPT_RULE,
    'DATOS DEL CLIENTE',
    RECEIPT_RULE,
    compact ? null : '',
    customerBlock,
    compact ? null : '',
    RECEIPT_RULE,
    'DETALLE DEL PEDIDO',
    RECEIPT_RULE,
    compact ? null : '',
    itemsBlock,
    footer,
  ].filter((line) => line !== null);

  return header.join('\n');
}

/** Texto plano — impresión térmica y WhatsApp (mismo formato) */
export function buildOrderReceiptText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  return buildReceiptCore(m, {
    customerBlock: buildCustomerPlain(m.customer),
    itemsBlock: buildItemsPlain(m.items),
  });
}

/** Texto ESC/POS por red — guiones ASCII, menos espacio arriba, acentos vía CP850 */
export function buildOrderReceiptTextEscPos(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  return buildReceiptCore(m, {
    customerBlock: buildCustomerPlain(m.customer, ESCPOS_BULLET),
    itemsBlock: buildItemsPlain(m.items, ESCPOS_BULLET),
    compact: true,
    bullet: ESCPOS_BULLET,
  });
}

/** Mensaje WhatsApp al cliente — confirmación de pedido recibido (admin) */
export function buildCustomerOrderConfirmationMessage(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const receipt = buildOrderReceiptText(order, branch);
  const firstName = (m.customer.name || 'Cliente').trim().split(/\s+/)[0];

  return [
    `Hola ${firstName},`,
    '',
    `Somos ${m.sucursal} — Pollería El Pollón.`,
    '',
    `Tu pedido N° ${m.ticketShort} fue recibido correctamente. Te enviamos el detalle:`,
    '',
    receipt,
    '',
    'Por favor, confírmanos que todo está correcto respondiendo a este mensaje.',
    '',
    '¡Gracias por tu preferencia!',
  ].join('\n');
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
  const bullet = RECEIPT_BULLET;
  const addrLines = wrapText(customer.address || '-', 28)
    .split('\n')
    .map((l) => `<div class="indent">${esc(l)}</div>`)
    .join('');

  const obsHtml = customer.comments?.trim()
    ? `<div class="field field--block">
         <div class="field-head"><span class="bullet">${bullet}</span> <strong>Observaciones:</strong></div>
         ${wrapText(customer.comments, 28).split('\n').map((l) => `<div class="indent">${esc(l)}</div>`).join('')}
       </div>`
    : '';

  return `
  <div class="field">
    <span class="bullet">${bullet}</span>
    <strong class="field-label">Nombre:</strong>
    <span class="field-value">${esc(customer.name || '-')}</span>
  </div>
  <div class="field">
    <span class="bullet">${bullet}</span>
    <strong class="field-label">Teléfono:</strong>
    <span class="field-value">${esc(customer.phone || '-')}</span>
  </div>
  <div class="field field--block">
    <div class="field-head"><span class="bullet">${bullet}</span> <strong>Dirección:</strong></div>
    ${addrLines}
  </div>
  ${obsHtml}`;
}

function buildItemsHtml(items) {
  if (!items.length) return '<div class="item-empty">Sin productos</div>';
  const bullet = RECEIPT_BULLET;

  return items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = getItemExtraLines(it)
      .map((line) => `<div class="indent item-sub">${esc(line)}</div>`)
      .join('');
    return `
    <div class="item">
      <div class="item-line"><span class="bullet">${bullet}</span> <strong>${qty}x ${esc(it.name)}</strong></div>
      ${extras}
      <div class="indent item-price"><strong>${formatMoneyPlain(it.total || 0)}</strong></div>
    </div>`;
  }).join('');
}

function buildFooterHtml(m) {
  const deliveryNote = buildDeliveryFooterLines(m)
    .map((line) => `<div class="note-line">${esc(line)}</div>`)
    .join('');

  const distLabel = m.deliveryDistanceKm != null
    ? `Delivery (${formatDistanceKm(m.deliveryDistanceKm)} km)`
    : 'Delivery';

  const deliveryBlock = m.deliveryFee > 0
    ? `<div class="money-row"><strong>Subtotal</strong><strong>${formatMoneyPlain(m.subtotal)}</strong></div>
  <div class="money-row"><span>${esc(distLabel)}</span><span>${formatMoneyPlain(m.deliveryFee)}</span></div>
  ${ruleHtml()}`
    : '';

  return `
  ${ruleHtml()}
  ${deliveryBlock}
  <div class="money-row money-row--total"><strong>TOTAL</strong><strong>${formatMoneyPlain(m.total)}</strong></div>
  <div class="pay-line"><strong>Pago:</strong> ${esc(String(m.payment || '').toUpperCase())}</div>
  ${deliveryNote}`;
}

/** HTML ticket térmico 80mm — tipografía monoespaciada estilo POS */
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
    margin: 0 auto;
    padding: 0;
    overflow-x: hidden;
    font-family: "Courier New", Courier, "Lucida Console", monospace;
    font-size: 12px;
    line-height: 1.35;
    background: #fff;
    color: #000;
    font-weight: 400;
  }
  .ticket {
    width: 100%;
    padding: 6px 8px 10px;
  }
  .ticket__feed-top {
    height: 8mm;
    min-height: 8mm;
  }
  .ticket__feed-bottom {
    height: 18mm;
    min-height: 18mm;
  }
  .title {
    font-weight: 700;
    font-size: 13px;
    text-align: center;
    text-transform: uppercase;
    margin-bottom: 8px;
    line-height: 1.2;
    letter-spacing: 0;
  }
  .track {
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    margin-bottom: 4px;
    line-height: 1.25;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
    font-size: 11px;
    margin-bottom: 2px;
    white-space: nowrap;
  }
  .meta-row span { flex: 0 1 auto; }
  .hr {
    margin: 6px 0;
    font-size: 11px;
    line-height: 1;
    letter-spacing: -0.5px;
    white-space: nowrap;
    overflow: hidden;
    color: #000;
    user-select: none;
    text-align: center;
  }
  .section-head {
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    line-height: 1.2;
    text-align: left;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 4px;
    margin: 3px 0;
    line-height: 1.3;
  }
  .field--block {
    display: block;
    margin: 4px 0;
  }
  .field-head {
    margin-bottom: 1px;
  }
  .bullet {
    flex-shrink: 0;
    font-weight: 700;
  }
  .field-label {
    font-weight: 700;
  }
  .field-value {
    font-weight: 400;
    word-break: break-word;
  }
  .indent {
    display: block;
    padding-left: 1.1em;
    margin-top: 1px;
    font-weight: 400;
    word-break: break-word;
  }
  .item {
    margin: 6px 0 8px;
  }
  .item-line {
    word-wrap: break-word;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }
  .item-sub {
    line-height: 1.3;
  }
  .item-price {
    margin-top: 2px;
  }
  .item-empty {
    margin: 4px 0;
  }
  .money-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: 2px 0;
    font-size: 12px;
    line-height: 1.3;
  }
  .money-row--total {
    font-size: 14px;
    font-weight: 700;
    margin: 4px 0 6px;
  }
  .pay-line {
    font-size: 12px;
    margin-top: 2px;
    line-height: 1.3;
  }
  .note-line {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.3;
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
    .ticket {
      padding: 8mm 6px 0 6px !important;
    }
    .ticket__feed-top {
      height: 10mm !important;
      min-height: 10mm !important;
    }
    .ticket__feed-bottom {
      height: 22mm !important;
      min-height: 22mm !important;
    }
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="ticket__feed-top" aria-hidden="true"></div>
  <div class="title">${esc(brandTitle(m.orderTypeLabel))}</div>
  <div class="track">CODIGO DE SEGUIMIENTO: ${esc(m.ticket)}</div>
  <div class="meta-row">
    <span>Pedido: ${esc(m.ticket)}</span>
    <span>${esc(m.fechaStr)}</span>
    <span>${esc(m.horaStr)}</span>
  </div>

  ${ruleHtml()}
  <div class="section-head">DATOS DEL CLIENTE</div>
  ${ruleHtml()}

  ${buildCustomerHtml(customer)}

  ${ruleHtml()}
  <div class="section-head">DETALLE DEL PEDIDO</div>
  ${ruleHtml()}

  ${buildItemsHtml(items)}
  ${buildFooterHtml(m)}
  <div class="ticket__feed-bottom" aria-hidden="true"></div>
</div>
<script>
  window.addEventListener('afterprint', function () {
    setTimeout(function () { try { window.close(); } catch (e) {} }, 150);
  });
</script>
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
    `height=${WIN_HEIGHT}`,
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

  const closePrintWindow = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (win && !win.closed) win.close();
      } catch {
        /* ignore */
      }
      if (printWinRef === win) printWinRef = null;
    }, 150);
  };

  const fitWindowToTicket = () => {
    try {
      const doc = win.document;
      const contentH = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        WIN_HEIGHT - 40,
      );
      const chromePad = Math.max(0, (win.outerHeight || 0) - (win.innerHeight || 0));
      // Altura mínima para que el pie del diálogo (Imprimir / Cancelar) no quede cortado
      const targetH = Math.min(Math.max(contentH + chromePad + 24, WIN_HEIGHT), 720);
      win.resizeTo(WIN_WIDTH, targetH);
    } catch {
      win.resizeTo(WIN_WIDTH, WIN_HEIGHT);
    }
  };

  let printed = false;
  const runPrint = () => {
    if (printed || win.closed) return;
    printed = true;
    fitWindowToTicket();

    try {
      win.addEventListener('afterprint', closePrintWindow);
      win.onafterprint = closePrintWindow;
    } catch {
      /* ignore */
    }

    setTimeout(() => {
      if (win.closed) return;
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn('[Pollón] print:', e);
        closePrintWindow();
      }
    }, 450);
  };

  win.addEventListener('load', runPrint);
  setTimeout(runPrint, 900);
}
