/** Modos de seguimiento del pedido para el cliente. */
export const TRACKING_MODE = {
  /** Repartidor aceptó desde la app → mapa en vivo + ETA */
  LIVE_MAP: 'live_map',
  /** Cajera avanza estados manualmente → solo barra de progreso */
  STATUS_LINE: 'status_line',
};

/** Pasos visibles al cliente en modo barra (sin mapa). */
export const STATUS_LINE_STEPS = [
  'confirmado',
  'preparando',
  'en_delivery',
  'entregado',
];

export function resolveTrackingMode(order, liveMeta = null) {
  const fromOrder = order?.trackingMode || order?.datos_json?.tracking_mode;
  if (fromOrder === TRACKING_MODE.LIVE_MAP || fromOrder === TRACKING_MODE.STATUS_LINE) {
    return fromOrder;
  }
  if (liveMeta?.tracking_mode === TRACKING_MODE.LIVE_MAP) return TRACKING_MODE.LIVE_MAP;
  if (liveMeta?.has_driver && liveMeta?.driver?.lat != null) return TRACKING_MODE.LIVE_MAP;
  return TRACKING_MODE.STATUS_LINE;
}

export function shouldShowLiveMap(order, liveMeta = null) {
  if (order?.orderType && order.orderType !== 'delivery') return false;
  const mode = resolveTrackingMode(order, liveMeta);
  if (mode !== TRACKING_MODE.LIVE_MAP) return false;
  if (order?.estado === 'entregado' || order?.estado === 'cancelado') return false;
  return Boolean(liveMeta?.has_driver);
}
