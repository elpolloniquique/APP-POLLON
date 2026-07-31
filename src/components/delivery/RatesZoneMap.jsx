import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../utils/geo';
import { normalizeZones } from '../../utils/deliveryZones';

function makeStoreIcon(label = 'EL POLLÓN') {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:36px;height:36px;border-radius:10px;background:#c00000;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;">🏠</div>
      <div style="margin-top:2px;padding:2px 7px;border-radius:6px;background:#7f1d1d;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25);">${label}</div>
    </div>`,
    iconSize: [90, 54],
    iconAnchor: [45, 28],
  });
}

function FitZones({ center, maxKm }) {
  const map = useMap();
  useEffect(() => {
    if (center?.lat == null || center?.lng == null) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      if (maxKm > 0) {
        const radiusM = maxKm * 1000 * 1.15;
        const bounds = L.latLng(center.lat, center.lng).toBounds(radiusM * 2);
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      } else {
        map.setView([center.lat, center.lng], DEFAULT_MAP_ZOOM);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [map, center?.lat, center?.lng, maxKm]);
  return null;
}

/**
 * Mapa de tarifas: círculos concéntricos desde la sucursal.
 * zones: [{ name, color, to_km, from_km, fee }]
 */
export function RatesZoneMap({
  className = '',
  center,
  zones = [],
  storeLabel = 'EL POLLÓN',
  styleId = 'streets',
  onStyleChange,
  highlightZoneId = null,
}) {
  const list = useMemo(() => normalizeZones(zones), [zones]);
  const maxKm = list.length ? Math.max(...list.map((z) => z.to_km)) : 0;
  const mapCenter = center?.lat != null
    ? { lat: Number(center.lat), lng: Number(center.lng) }
    : DEFAULT_MAP_CENTER;

  // Dibujar de mayor a menor radio para que las internas queden arriba
  const circles = useMemo(
    () => [...list].sort((a, b) => b.to_km - a.to_km),
    [list],
  );

  const tiles = styleId === 'satellite'
    ? {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Esri',
      }
    : {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap',
      };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={13}
        className="h-full min-h-[360px] w-full"
        scrollWheelZoom
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} />
        <FitZones center={mapCenter} maxKm={maxKm} />

        {circles.map((z) => {
          const active = highlightZoneId && highlightZoneId === z.id;
          return (
            <Circle
              key={z.id}
              center={[mapCenter.lat, mapCenter.lng]}
              radius={z.to_km * 1000}
              pathOptions={{
                color: z.color,
                weight: active ? 3 : 2,
                opacity: active ? 0.95 : 0.75,
                fillColor: z.color,
                fillOpacity: active ? 0.22 : 0.12,
              }}
            >
              <Popup>
                <strong>{z.name}</strong>
                <br />
                Hasta {z.to_km} km · ${Number(z.fee).toLocaleString('es-CL')}
              </Popup>
            </Circle>
          );
        })}

        <Marker position={[mapCenter.lat, mapCenter.lng]} icon={makeStoreIcon(storeLabel)}>
          <Popup>
            <strong>{storeLabel}</strong>
            <br />
            Centro 0.0 km
          </Popup>
        </Marker>
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/40 to-transparent" />

      {typeof onStyleChange === 'function' && (
        <div className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            className={`pointer-events-auto px-3 py-1.5 text-xs font-semibold ${styleId === 'streets' ? 'bg-pollon-red text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => onStyleChange('streets')}
          >
            Mapa
          </button>
          <button
            type="button"
            className={`pointer-events-auto px-3 py-1.5 text-xs font-semibold ${styleId === 'satellite' ? 'bg-pollon-red text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => onStyleChange('satellite')}
          >
            Satélite
          </button>
        </div>
      )}
    </div>
  );
}
