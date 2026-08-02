/**
 * Control de cobro interno para cajeras (NO va al ticket ni al cliente).
 * - N/A: delivery sin repartidor asignado
 * - por_pagar / pagado: cuando ya hay repartidor (o pedido retiro/local)
 */
export const CAJA_PAGO = {
  NA: 'na',
  POR_PAGAR: 'por_pagar',
  PAGADO: 'pagado',
};

export function hasDriverAssigned(deliveryInfo) {
  return Boolean(deliveryInfo?.driverId || deliveryInfo?.driver?.full_name || deliveryInfo?.driver?.nombre);
}

/**
 * Estado efectivo que debe ver la cajera.
 * @param {object} order
 * @param {object|null} deliveryInfo
 */
export function resolveCajaPagoStatus(order, deliveryInfo = null) {
  const isDelivery = (order?.orderType || order?.tipo_entrega) === 'delivery';
  if (isDelivery && !hasDriverAssigned(deliveryInfo)) {
    return CAJA_PAGO.NA;
  }
  if (order?.cajaPago === CAJA_PAGO.PAGADO) return CAJA_PAGO.PAGADO;
  return CAJA_PAGO.POR_PAGAR;
}

export function cajaPagoLabel(status) {
  if (status === CAJA_PAGO.PAGADO) return 'Pagado';
  if (status === CAJA_PAGO.POR_PAGAR) return 'Por pagar';
  return 'N/A';
}

export function canEditCajaPago(order, deliveryInfo = null) {
  return resolveCajaPagoStatus(order, deliveryInfo) !== CAJA_PAGO.NA;
}
