/** Zonas de tarifa por distancia (km desde la sucursal). */

export const ZONE_PALETTE = [
  '#ef4444', // rojo
  '#22c55e', // verde
  '#3b82f6', // azul
  '#a855f7', // morado
  '#f59e0b', // ámbar
  '#06b6d4', // cyan
  '#ec4899', // rosa
  '#84cc16', // lima
];

/** Default El Pollón Iquique — coincide con el diseño de zonas */
export const DEFAULT_DELIVERY_ZONES = [
  { id: 'z1', name: 'Zona 01', color: '#ef4444', from_km: 0, to_km: 2.5, fee: 2500 },
  { id: 'z2', name: 'Zona 02', color: '#22c55e', from_km: 2.5, to_km: 3, fee: 3000 },
  { id: 'z3', name: 'Zona 03', color: '#3b82f6', from_km: 3, to_km: 3.5, fee: 3500 },
  { id: 'z4', name: 'Zona 04', color: '#a855f7', from_km: 3.5, to_km: 5, fee: 4000 },
];

export function nextZoneColor(zones = []) {
  const used = new Set((zones || []).map((z) => z.color));
  return ZONE_PALETTE.find((c) => !used.has(c)) || ZONE_PALETTE[zones.length % ZONE_PALETTE.length];
}

export function nextZoneName(zones = []) {
  const n = String((zones?.length || 0) + 1).padStart(2, '0');
  return `Zona ${n}`;
}

export function normalizeZones(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z, i) => ({
      id: z.id || `z-${i + 1}`,
      name: z.name || `Zona ${String(i + 1).padStart(2, '0')}`,
      color: z.color || ZONE_PALETTE[i % ZONE_PALETTE.length],
      from_km: Number(z.from_km) || 0,
      to_km: Number(z.to_km) || 0,
      fee: Math.round(Number(z.fee) || 0),
    }))
    .filter((z) => z.to_km > 0)
    .sort((a, b) => a.to_km - b.to_km);
}

/**
 * Cotiza fee por distancia.
 * Regla: primera zona cuyo to_km >= km (tras ordenar por to_km).
 * Ej: 2.5 km → Zona 01 ($2500); 2.51 → Zona 02 ($3000).
 *
 * @returns {{ fee: number, zone: object|null, distanceKm: number, outOfRange: boolean, maxKm: number }}
 */
export function quoteFromZones(zones, distanceKm) {
  const list = normalizeZones(zones);
  const km = Math.max(0, Number(distanceKm) || 0);
  const maxKm = list.length ? Math.max(...list.map((z) => z.to_km)) : 0;

  if (!list.length) {
    return { fee: 0, zone: null, distanceKm: km, outOfRange: true, maxKm: 0 };
  }

  const zone = list.find((z) => km <= z.to_km) || null;
  if (!zone) {
    return {
      fee: 0,
      zone: null,
      distanceKm: km,
      outOfRange: true,
      maxKm,
    };
  }

  // Ajusta from_km visualmente para la zona encontrada
  const idx = list.indexOf(zone);
  const from_km = idx === 0 ? 0 : list[idx - 1].to_km;
  const resolved = { ...zone, from_km };

  return {
    fee: resolved.fee,
    zone: resolved,
    distanceKm: km,
    outOfRange: false,
    maxKm,
  };
}

export function coverageKm(zones) {
  const list = normalizeZones(zones);
  return list.length ? Math.max(...list.map((z) => z.to_km)) : 0;
}

export function formatKmRange(fromKm, toKm) {
  const a = Number(fromKm) || 0;
  const b = Number(toKm) || 0;
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
  return `${fmt(a)} – ${fmt(b)} km`;
}
