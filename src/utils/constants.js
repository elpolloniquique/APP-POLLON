export const BAG_PRICE = 200;
export const WHATSAPP_DEFAULT = import.meta.env.VITE_WHATSAPP_DEFAULT || '56986925310';
export const ORDERS_KEY = 'pollon_orders_v1';
export const BRANCH_KEY = 'pollon_branch_v1';
export const CART_KEY = 'pollon_cart_v2';
export const CUSTOMER_SESSION_KEY = 'pollon_customer_v1';

export const CATEGORY_ORDER = [
  'ofertas-familiares',
  'ofertas-dos',
  'ofertas-personales',
  'platos-extras',
  'agregados',
  'bebidas',
  'descartables',
];

export const CATEGORY_META = {
  'ofertas-familiares': { title: 'Ofertas Familiares', emoji: '👨‍👩‍👧‍👦' },
  'ofertas-dos': { title: 'Ofertas para Dos', emoji: '👫' },
  'ofertas-personales': { title: 'Ofertas Personales', emoji: '🧑' },
  'platos-extras': { title: 'Platos Extras', emoji: '🍽️' },
  agregados: { title: 'Agregados', emoji: '➕' },
  bebidas: { title: 'Bebidas', emoji: '🥤' },
  descartables: { title: 'Descartables', emoji: '🍴' },
};

/** Estados internos del pedido */
export const ORDER_STATES = [
  'pendiente',
  'confirmado',
  'preparando',
  'listo',
  'en_delivery',
  'entregado',
  'cancelado',
];

/** Etiquetas para el cliente */
export const ORDER_STATUS_LABELS = {
  pendiente: { label: 'Pedido recibido', step: 1, color: 'bg-blue-500' },
  confirmado: { label: 'Confirmado', step: 2, color: 'bg-indigo-500' },
  preparando: { label: 'En cocina', step: 3, color: 'bg-amber-500' },
  listo: { label: 'Listo para retiro', step: 4, color: 'bg-teal-500' },
  en_delivery: { label: 'En reparto', step: 5, color: 'bg-purple-500' },
  entregado: { label: 'Entregado', step: 6, color: 'bg-green-600' },
  cancelado: { label: 'Cancelado', step: 0, color: 'bg-red-500' },
};

export const ORDER_STATUS_STEPS = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_delivery', 'entregado'];

export const ORDER_TYPE_LABELS = {
  delivery: 'Delivery',
  retiro: 'Retiro en local',
  reserva: 'Reserva',
};

export const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo', icon: '💵', desc: 'Paga al recibir tu pedido (delivery o retiro)' },
  { id: 'transferencia', label: 'Transferencia', icon: '🏦', desc: 'Transfiere y envía comprobante por WhatsApp' },
];

export const TRANSFER_BANK_INFO = {
  banco: 'Banco Estado',
  tipo: 'Cuenta Vista',
  nombre: 'Pollería El Pollón',
  rut: 'XX.XXX.XXX-X',
  numero: 'XXXX XXXX XXXX',
  email: 'contacto@elpollon.cl',
};

export const DRINK_OPTIONS = [
  'Coca Cola', 'Coca Cola Cero', 'Inca Kola', 'Fanta', 'Sprite', 'Sprite Cero', 'Agua Sin Gas', 'Agua Con Gas',
];

/** Roles del sistema */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN_SUCURSAL: 'admin_sucursal',
  CAJERA: 'cajera',
  COCINA: 'cocina',
  DELIVERY: 'delivery',
  CLIENTE: 'cliente',
  // Legacy
  ADMINISTRADOR: 'administrador',
};

export const STAFF_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_SUCURSAL,
  ROLES.CAJERA,
  ROLES.COCINA,
  ROLES.DELIVERY,
  ROLES.ADMINISTRADOR,
];

export const ROLE_PERMISSIONS = {
  super_admin: ['dashboard', 'menu', 'orders', 'kitchen', 'products', 'categories', 'branches', 'cash', 'inventory', 'reports', 'settings', 'users', 'customers', 'campaigns'],
  admin_sucursal: ['dashboard', 'menu', 'orders', 'kitchen', 'cash', 'customers', 'campaigns', 'settings'],
  administrador: ['dashboard', 'menu', 'orders', 'kitchen', 'branches', 'cash', 'inventory', 'reports', 'settings', 'customers'],
  cajera: ['dashboard', 'orders', 'cash', 'customers'],
  cajero: ['dashboard', 'orders', 'cash'],
  cocina: ['kitchen', 'orders'],
  delivery: ['orders'],
  repartidor: ['orders'],
  cliente: [],
};

export const ADMIN_NAV = [
  { id: 'dashboard', path: '/admin', label: 'Dashboard', perm: 'dashboard' },
  { id: 'menu', path: '/admin/menu', label: 'Menú por sucursal', perm: 'menu' },
  { id: 'pedidos', path: '/admin/pedidos', label: 'Pedidos', perm: 'orders' },
  { id: 'cocina', path: '/admin/cocina', label: 'Cocina', perm: 'kitchen' },
  { id: 'clientes', path: '/admin/clientes', label: 'Clientes', perm: 'customers' },
  { id: 'campanas', path: '/admin/campanas', label: 'Campañas', perm: 'campaigns' },
  { id: 'sucursales', path: '/admin/sucursales', label: 'Sucursales', perm: 'branches' },
  { id: 'caja', path: '/admin/caja', label: 'Caja diaria', perm: 'cash' },
  { id: 'stock', path: '/admin/stock', label: 'Stock', perm: 'inventory' },
  { id: 'reportes', path: '/admin/reportes', label: 'Reportes', perm: 'reports' },
  { id: 'config', path: '/admin/config', label: 'Configuración', perm: 'settings' },
];
