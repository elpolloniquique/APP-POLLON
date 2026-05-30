import { BAG_PRICE, CORE_CATEGORY_NAMES } from './constants';

/** Resuelve opciones de bebida/bolsa (producto + categoría). */
export function resolveProductOptions(product, categoryName = '') {
  const cat = (categoryName || '').trim().toLowerCase();
  const isFamiliares = cat.includes('familiar')
    || CORE_CATEGORY_NAMES[0].toLowerCase() === cat;

  const drinkEnabled = product?.drinkEnabled ?? isFamiliares;
  const bagEnabled = product?.bagEnabled ?? isFamiliares;

  return {
    drinkEnabled,
    drinkRequired: product?.drinkRequired ?? (drinkEnabled && isFamiliares),
    bagEnabled,
    bagRequired: product?.bagRequired ?? (bagEnabled && isFamiliares),
    bagPrice: Number(product?.bagPrice ?? BAG_PRICE) || BAG_PRICE,
  };
}

export function calcLineTotal({ unitPrice, qty, bagPrice, includeBag }) {
  const q = Math.max(1, qty || 1);
  const bags = includeBag ? q : 0;
  return (Number(unitPrice) || 0) * q + (Number(bagPrice) || 0) * bags;
}

export function formatDrinksLabel(drinks) {
  if (!drinks?.length) return '';
  const list = drinks.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list.map((d, i) => `#${i + 1}: ${d}`).join(' · ');
}

/** Opciones mostradas en el modal (diseño tienda). */
export const MODAL_DRINK_OPTIONS = [
  'Coca Cola',
  'Inca Kola',
  'Coca Cola Cero',
  'Sprite',
  'Fanta',
];

export function defaultProductOptionsForCategory(categoryName = '') {
  const isFamiliares = (categoryName || '').trim().toLowerCase().includes('familiar');
  return {
    drinkEnabled: isFamiliares,
    drinkRequired: isFamiliares,
    bagEnabled: isFamiliares,
    bagRequired: isFamiliares,
    bagPrice: BAG_PRICE,
  };
}
