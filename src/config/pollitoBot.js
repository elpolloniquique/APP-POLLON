/** Pollito Bot — configuración del asistente virtual El Pollón */

export const POLLITO_WELCOME = `🐥🤖 ¡Hola! Soy **Pollito Bot**, el asistente virtual oficial de **El Pollón**.

Estoy aquí para ayudarte con:

✅ Carta y productos
✅ Delivery
✅ Horarios
✅ Sucursales
✅ Promociones
✅ Reservas
✅ Información de pedidos

Antes de comenzar, selecciona la sucursal sobre la que deseas consultar 👇`;

export const POLLITO_BRANCH_OPTIONS = [
  { id: 'iquique-vivar', label: '📍 El Pollón Iquique' },
  { id: 'alto-hospicio', label: '📍 El Pollón Alto Hospicio' },
  { id: 'arica-santa-maria', label: '📍 El Pollón Arica Santa María' },
  { id: 'arica-saucache', label: '📍 El Pollón Arica Saucache' },
];

export const POLLITO_QUICK_ACTIONS = [
  { id: 'carta', label: '🍗 Ver Carta', message: 'Quiero ver la carta y productos disponibles' },
  { id: 'promos', label: '🎉 Promociones', message: '¿Qué promociones tienen vigentes?' },
  { id: 'sucursales', label: '📍 Sucursales', message: 'Información de sucursales y ubicaciones' },
  { id: 'delivery', label: '🛵 Delivery', message: '¿Hacen delivery? ¿Cuánto demora y cuál es el costo?' },
  { id: 'horarios', label: '🕒 Horarios', message: '¿Cuál es el horario de atención?' },
  { id: 'whatsapp', label: '📲 WhatsApp', message: 'Quiero realizar un pedido por WhatsApp' },
  { id: 'pago', label: '💳 Métodos de Pago', message: '¿Qué métodos de pago aceptan?' },
  { id: 'contacto', label: '📞 Contacto', message: '¿Cómo puedo contactarlos?' },
];

export const POLLITO_ESCALATION_KEYWORDS = [
  'pedido', 'reclamo', 'whatsapp', 'queja', 'cancelar', 'modificar', 'hablar con',
];

export function matchBranchFromText(text, branches) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return null;

  const aliasMap = [
    { ids: ['iquique-vivar', 'iquique'], words: ['iquique', 'vivar', 'cavancha'] },
    { ids: ['alto-hospicio', 'alto hospicio'], words: ['alto hospicio', 'hospicio'] },
    { ids: ['arica-santa-maria', 'santa maria'], words: ['santa maría', 'santa maria', 'arica santa'] },
    { ids: ['arica-saucache', 'saucache'], words: ['saucache', 'arica saucache'] },
    { ids: ['arica-santa-maria', 'arica-saucache'], words: ['arica'] },
  ];

  for (const group of aliasMap) {
    if (group.words.some((w) => q.includes(w))) {
      const found = branches.find((b) =>
        group.ids.some((id) => b.id === id || b.slug === id),
      );
      if (found) return found;
    }
  }

  return branches.find((b) =>
    q.includes(b.name?.toLowerCase()) || q.includes(b.city?.toLowerCase()),
  ) || null;
}
