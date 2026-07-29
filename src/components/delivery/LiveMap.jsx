import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../utils/geo';
import { fetchOsrmRoute } from '../../utils/osrm';

function makeDivIcon(kind, color) {
  const text = kind === 'driver' ? 'D' : kind === 'store' ? 'P' : 'C';
  const bg = color || (kind === 'driver' ? '#f97316' : kind === 'store' ? '#2563eb' : '#c00000');
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${text}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function FollowMarker({ followId, markers }) {
  const map = useMap();

  useEffect(() => {
    const target = markers.find((m) => m.id === followId);
    if (target?.lat != null && target?.lng != null) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
    }
  }, [map, followId, markers]);

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [map]);

  return null;
}

export function LiveMap({
  className = '',
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  markers = [],
  routes = [],
  followId = null,
  styleId = 'streets',
  onStyleChange,
}) {
  const [mapError, setMapError] = useState('');
  const [resolvedRoutes, setResolvedRoutes] = useState([]);

  const tileUrl = styleId === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = styleId === 'satellite'
    ? '&copy; Esri'
    : '&copy; OpenStreetMap contributors';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = [];
      for (const route of routes) {
        if (!route?.from || !route?.to) continue;
        const result = await fetchOsrmRoute(route.from, route.to);
        if (cancelled) return;
        if (result?.coordinates?.length) {
          next.push({
            id: route.id,
            color: route.color || '#c00000',
            positions: result.coordinates.map(([lng, lat]) => [lat, lng]),
          });
        }
      }
      setResolvedRoutes(next);
    })().catch(() => setResolvedRoutes([]));
    return () => {
      cancelled = true;
    };
  }, [routes]);

  const markerNodes = useMemo(
    () => markers.filter((m) => m.lat != null && m.lng != null),
    [markers]
  );

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom
        className="h-full min-h-[320px] w-full"
      >
        <TileLayer
          key={`${styleId}-${tileUrl}`}
          url={tileUrl}
          attribution={attribution}
          eventHandlers={{
            loading: () => setMapError(''),
            tileerror: () => setMapError('No se pudieron cargar algunos tiles del mapa'),
          }}
        />

        {markerNodes.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={makeDivIcon(m.kind, m.color)}>
            {m.label ? <Popup>{m.label}</Popup> : null}
          </Marker>
        ))}

        {resolvedRoutes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.positions}
            pathOptions={{ color: route.color, weight: 4, opacity: 0.85 }}
          />
        ))}

        <FollowMarker followId={followId} markers={markerNodes} />
      </MapContainer>

      {mapError && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow">
          El mapa base tuvo problemas cargando tiles. Intenta cambiar entre Calles y Satelite.
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-xl bg-white/95 p-1 shadow">
        {['streets', 'satellite'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onStyleChange?.(id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              styleId === id ? 'bg-pollon-red text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {id === 'streets' ? 'Calles' : 'Satelite'}
          </button>
        ))}
      </div>
    </div>
  );
}
