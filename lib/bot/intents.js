/** Detección de intenciones por reglas + bot_intents (sin IA) */

import { foldAccents, includesAny, extractOrderCode } from './text.js';

const FALLBACK_INTENTS = [
  { code: 'GREETING', keywords: ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'hey'], priority: 10, handler: 'handleGreeting' },
  { code: 'GOODBYE', keywords: ['chao', 'adios', 'adiós', 'hasta luego', 'nos vemos'], priority: 15, handler: 'handleGoodbye' },
  { code: 'THANKS', keywords: ['gracias', 'muchas gracias', 'se agradece'], priority: 20, handler: 'handleThanks' },
  { code: 'HUMAN_SUPPORT', keywords: ['persona', 'alguien', 'encargado', 'administrador', 'ejecutivo', 'hablar con alguien'], priority: 25, handler: 'handleHumanSupport' },
  { code: 'COMPLAINT', keywords: ['reclamo', 'queja', 'pedido malo', 'llegó mal', 'llego mal', 'faltante', 'cobro incorrecto'], priority: 30, handler: 'handleComplaint' },
  { code: 'ORDER_STATUS', keywords: ['mi pedido', 'estado', 'seguimiento', 'donde va', 'dónde va', 'como va', 'cómo va', 'ya salio', 'ya salió'], priority: 40, handler: 'handleOrderStatus' },
  { code: 'HOW_TO_BUY', keywords: ['como compro', 'cómo compro', 'como pido', 'cómo pido', 'quiero pedir', 'deseo comprar', 'hacer pedido'], priority: 50, handler: 'handleHowToBuy' },
  { code: 'PAYMENT_METHOD', keywords: ['pago', 'pagar', 'efectivo', 'transferencia', 'webpay', 'tarjeta'], priority: 55, handler: 'handlePayment' },
  { code: 'PRODUCT_PRICE', keywords: ['precio', 'cuanto', 'cuánto', 'vale', 'cuesta', 'sale', 'presio'], priority: 60, handler: 'handleProductPrice' },
  { code: 'DELIVERY_PRICE', keywords: ['cuanto delivery', 'cuánto delivery', 'valor despacho', 'cuesta el envio', 'cuesta el envío'], priority: 85, handler: 'handleDelivery' },
  { code: 'DELIVERY', keywords: ['delivery', 'despacho', 'envio', 'envío', 'reparto', 'delibery', 'llegan'], priority: 90, handler: 'handleDelivery' },
  { code: 'OPENING_HOURS', keywords: ['horario', 'abierto', 'cierran', 'atienden', 'hora'], priority: 95, handler: 'handleHours' },
  { code: 'BRANCH', keywords: ['sucursal', 'local', 'direccion', 'dirección', 'donde estan', 'dónde están'], priority: 100, handler: 'handleBranch' },
  { code: 'MENU', keywords: ['menu', 'menú', 'carta', 'que venden', 'qué venden'], priority: 75, handler: 'handleProductSearch' },
  { code: 'PROMOTION', keywords: ['promo', 'promocion', 'promoción', 'oferta'], priority: 80, handler: 'handlePromotion' },
  { code: 'CONTACT', keywords: ['telefono', 'teléfono', 'contacto', 'llamar'], priority: 110, handler: 'handleContact' },
];

export function expandWithSynonyms(folded, synonymRows) {
  let t = folded;
  for (const row of synonymRows || []) {
    if (row.active === false) continue;
    const canon = foldAccents(row.canonical);
    for (const alias of row.aliases || []) {
      const fa = foldAccents(alias);
      if (fa && t.includes(fa) && canon && !t.includes(canon)) t = `${t} ${canon}`;
    }
  }
  return t;
}

export function detectIntent({ folded, original, intentRows, products = [] }) {
  const codeInText = extractOrderCode(original);
  const rows = (intentRows?.length ? intentRows : FALLBACK_INTENTS)
    .slice()
    .sort((a, b) => (a.priority || 100) - (b.priority || 100));

  if (codeInText && includesAny(folded, ['pedido', 'estado', 'seguimiento', 'codigo', 'código', 'donde', 'va'])) {
    return { code: 'ORDER_STATUS', handler: 'handleOrderStatus', confidence: 0.92, reason: 'order_code', orderCode: codeInText };
  }

  for (const row of rows) {
    const keys = row.keywords || [];
    if (!keys.length) continue;
    if (includesAny(folded, keys)) {
      const confidence = folded.split(/\s+/).length <= 4 ? 0.9 : 0.82;
      return {
        code: row.code,
        handler: row.handler || handlerFor(row.code),
        confidence,
        reason: 'keyword',
        orderCode: codeInText,
        templates: row.templates || [],
      };
    }
  }

  const productHits = (products || []).filter((p) => {
    const nameFold = foldAccents(p.name);
    return nameFold.split(/\s+/).filter((t) => t.length >= 4).some((t) => folded.includes(t));
  });
  if (productHits.length) {
    const priceAsk = includesAny(folded, ['precio', 'cuanto', 'cuánto', 'vale', 'cuesta', 'sale', 'tienen', 'hay']);
    return {
      code: priceAsk ? 'PRODUCT_PRICE' : 'PRODUCT_SEARCH',
      handler: priceAsk ? 'handleProductPrice' : 'handleProductSearch',
      confidence: 0.78,
      reason: 'product',
      products: productHits.slice(0, 5),
      orderCode: codeInText,
    };
  }

  if (folded.length <= 12 && includesAny(folded, ['hola', 'buenas', 'hey'])) {
    return { code: 'GREETING', handler: 'handleGreeting', confidence: 0.88, reason: 'short_hello' };
  }

  return { code: 'UNKNOWN', handler: 'handleUnknown', confidence: 0.2, reason: 'none', orderCode: codeInText };
}

function handlerFor(code) {
  const map = {
    GREETING: 'handleGreeting',
    GOODBYE: 'handleGoodbye',
    THANKS: 'handleThanks',
    HUMAN_SUPPORT: 'handleHumanSupport',
    COMPLAINT: 'handleComplaint',
    ORDER_STATUS: 'handleOrderStatus',
    ORDER_DETAILS: 'handleOrderStatus',
    ORDER_TRACKING: 'handleOrderStatus',
    HOW_TO_BUY: 'handleHowToBuy',
    PAYMENT_METHOD: 'handlePayment',
    PRODUCT_PRICE: 'handleProductPrice',
    PRODUCT_SEARCH: 'handleProductSearch',
    MENU: 'handleProductSearch',
    PROMOTION: 'handlePromotion',
    DELIVERY: 'handleDelivery',
    DELIVERY_PRICE: 'handleDelivery',
    DELIVERY_ZONE: 'handleDelivery',
    OPENING_HOURS: 'handleHours',
    BRANCH: 'handleBranch',
    BRANCH_ADDRESS: 'handleBranch',
    CONTACT: 'handleContact',
    FAQ: 'handleKnowledgeSearch',
    UNKNOWN: 'handleUnknown',
  };
  return map[code] || 'handleUnknown';
}
