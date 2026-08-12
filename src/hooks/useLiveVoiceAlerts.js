import { useEffect, useRef } from 'react';
import { haversineKm } from '../utils/geo';
import {
  buildApproachingSpeech,
  buildArrivedSpeech,
  speakAlert,
  tripSignature,
} from '../utils/liveVoiceAlert';
import { getDriverActiveOrdersDetail } from '../services/trackingService';

const ETA_ALERT_MIN = 5;
const ARRIVAL_RADIUS_M = 90;

/**
 * Vigila repartidores hacia recojo y dispara alertas de voz:
 * - ~5 min de ETA a la sucursal
 * - llegada a la sucursal (fase at_store o radio GPS)
 *
 * @param {{
 *   enabled: boolean,
 *   pickupDrivers: Array<{ driverId: string, name: string, phase: string, lat?: number, lng?: number, assignments?: any[] }>,
 *   etas: Record<string, number>,
 *   store: { lat: number, lng: number },
 *   arrivalRadiusM?: number,
 * }} opts
 */
export function useLiveVoiceAlerts({ enabled, pickupDrivers, etas, store, arrivalRadiusM = ARRIVAL_RADIUS_M }) {
  const announcedRef = useRef(new Set()); // keys ya anunciadas
  const detailCacheRef = useRef(new Map()); // driverId -> { at, orders }
  const processingRef = useRef(new Set()); // evitar race por driver
  const radius = Math.min(300, Math.max(20, Number(arrivalRadiusM) || ARRIVAL_RADIUS_M));

  // Limpia anuncios de viajes que ya no están en pickup
  useEffect(() => {
    const activeTrips = new Set(
      (pickupDrivers || []).map((d) => {
        const ids = (d.assignments || []).map((a) => a.id).filter(Boolean);
        return tripSignature(d.driverId, ids);
      })
    );
    for (const key of [...announcedRef.current]) {
      const trip = key.split('|')[1];
      if (trip && !activeTrips.has(trip)) announcedRef.current.delete(key);
    }
  }, [pickupDrivers]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!store?.lat || !store?.lng) return undefined;
    if (!pickupDrivers?.length) return undefined;

    let cancelled = false;

    const run = async () => {
      // Orden: los más cercanos (menor ETA) primero
      const sorted = [...pickupDrivers].sort((a, b) => {
        const ea = etas[a.driverId] ?? 999;
        const eb = etas[b.driverId] ?? 999;
        return ea - eb;
      });

      for (const d of sorted) {
        if (cancelled) return;
        const ids = (d.assignments || []).map((a) => a.id).filter(Boolean);
        const trip = tripSignature(d.driverId, ids);
        const etaKey = `eta5|${trip}`;
        const arrKey = `arrived|${trip}`;

        const distM = (d.lat != null && d.lng != null)
          ? (haversineKm(d.lat, d.lng, store.lat, store.lng) ?? 99) * 1000
          : Infinity;

        const arrived =
          d.phase === 'at_store'
          || distM <= radius
          || (etas[d.driverId] != null && etas[d.driverId] <= 0);

        const approaching =
          !arrived
          && d.phase === 'to_store'
          && etas[d.driverId] != null
          && etas[d.driverId] <= ETA_ALERT_MIN;

        if (!approaching && !arrived) continue;
        if (arrived && announcedRef.current.has(arrKey)) continue;
        if (approaching && announcedRef.current.has(etaKey)) continue;
        if (processingRef.current.has(d.driverId)) continue;

        processingRef.current.add(d.driverId);
        try {
          const orders = await loadOrders(d.driverId, detailCacheRef);
          if (cancelled) return;

          if (arrived) {
            announcedRef.current.add(arrKey);
            announcedRef.current.add(etaKey); // no repetir el de 5 min después
            const text = buildArrivedSpeech({
              driverName: d.name,
              orderCount: orders.length || ids.length || 1,
            });
            await speakAlert(text);
          } else if (approaching) {
            announcedRef.current.add(etaKey);
            const text = buildApproachingSpeech({
              driverName: d.name,
              etaMin: ETA_ALERT_MIN,
              orders,
            });
            await speakAlert(text);
          }
        } finally {
          processingRef.current.delete(d.driverId);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [enabled, pickupDrivers, etas, store, radius]);
}

async function loadOrders(driverId, cacheRef) {
  const cached = cacheRef.current.get(driverId);
  if (cached && Date.now() - cached.at < 45000) return cached.orders;
  try {
    const detail = await getDriverActiveOrdersDetail(driverId);
    const orders = (detail?.orders || []).filter(
      (o) => o.phase === 'to_store' || o.phase === 'at_store' || !o.phase
    );
    // Si filtro vacía, usa todos (aún van a recojo)
    const list = orders.length ? orders : (detail?.orders || []);
    cacheRef.current.set(driverId, { at: Date.now(), orders: list });
    return list;
  } catch {
    return cached?.orders || [];
  }
}
