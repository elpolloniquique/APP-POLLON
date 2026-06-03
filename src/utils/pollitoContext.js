import { DELIVERY_COST_RANGE, PAYMENT_METHODS } from './constants';
import { money } from './format';

export function branchToPollitoContext(branch) {
  if (!branch) return null;
  return {
    id: branch.id,
    name: branch.name,
    city: branch.city,
    address: branch.address,
    schedule: branch.schedule || branch.opening_hours,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    deliveryZones: branch.deliveryZones || branch.zona_delivery,
    deliveryEta: branch.deliveryEta || branch.tiempo_entrega,
    deliveryCost: branch.deliveryCost ?? branch.costo_delivery,
    deliveryEnabled: branch.deliveryEnabled,
    pickupEnabled: branch.pickupEnabled,
    reservationsEnabled: branch.reservationsEnabled,
  };
}

export function buildPollitoSiteContext(branches) {
  const active = (branches || []).filter((b) => !b.comingSoon && b.isActive !== false);
  return {
    siteUrl: 'https://el-pollon.cl',
    payments: PAYMENT_METHODS.map((p) => p.label).join(' y '),
    deliveryRange: `$${DELIVERY_COST_RANGE.min.toLocaleString('es-CL')} – $${DELIVERY_COST_RANGE.max.toLocaleString('es-CL')} (orientativo según sucursal)`,
    branches: active.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      address: b.address,
      schedule: b.schedule,
    })),
  };
}

export function buildPollitoMenuContext(categories, productsByCategory, maxPerCategory = 12) {
  if (!categories?.length) return [];
  return categories.map((cat) => ({
    categoria: cat.name,
    productos: (productsByCategory[cat.id] || [])
      .filter((p) => p.available !== false)
      .slice(0, maxPerCategory)
      .map((p) => ({
        nombre: p.name,
        precio: p.price,
        descripcion: (p.description || '').slice(0, 100),
      })),
  })).filter((c) => c.productos.length > 0);
}

/** Resumen corto para mostrar en UI */
export function formatBranchConfirm(branch) {
  if (!branch) return '';
  return `Perfecto, consultaré sobre **${branch.name}** 📍 ${branch.address || branch.city}. ¿En qué te ayudo?`;
}

export function formatMenuSnippet(categories, productsByCategory) {
  const ctx = buildPollitoMenuContext(categories, productsByCategory, 3);
  if (!ctx.length) return null;
  const lines = ctx.slice(0, 3).flatMap((cat) =>
    cat.productos.slice(0, 2).map((p) => `• ${p.nombre}: ${money(p.precio)}`),
  );
  return lines.slice(0, 6).join('\n');
}
