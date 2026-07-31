import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../utils/geo';
import { fetchOsrmRoute } from '../../utils/osrm';
import { PICKUP_COLORS, DELIVERY_COLORS } from '../../utils/liveMapColors';

function makeDivIcon(kind, color, label) {
  if (kind === 'store') {
    return L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:34px;height:34px;border-radius:10px;background:#2563eb;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;">🏠</div>
        <div style="margin-top:2px;padding:2px 6px;border-radius:6px;background:#1e3a8a;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25);">${label || 'EL POLLON'}</div>
      </div>`,
      iconSize: [80, 52],
      iconAnchor: [40, 26],
      popupAnchor: [0, -20],
    });
  }

  const letter = kind === 'driver' ? '🛵' : '📍';
  const nameHtml = label
    ? `<div style="margin-top:2px;padding:2px 7px;border-radius:999px;background:${color || '#c00000'};color:#fff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);">${label}</div>`
    : '';

  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:28px;height:28px;border-radius:9999px;background:${color || '#c00000'};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:12px;">${letter}</div>
      ${nameHtml}
    </div>`,
    iconSize: [90, 48],
    iconAnchor: [45, 20],
    popupAnchor: [0, -16],
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

  useEffect(() => {
    const onDrawer = () => {
      setTimeout(() => map.invalidateSize({ animate: false }), 280);
    };
    window.addEventListener('ep-admin-drawer', onDrawer);
    return () => window.removeEventListener('ep-admin-drawer', onDrawer);
  }, [map]);

  return null;
}

function MapCenterSync({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center?.lat != null && center?.lng != null) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
    }
  }, [map, center?.lat, center?.lng]);
  return null;
}

/**
 * markers: [{ id, lat, lng, label, color, kind }]
 * routes: [{ id, from:{lat,lng}, to:{lat,lng}, color }]
 * store: { lat, lng, label } | null
 */
export function LiveMap({
  className = '',
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  markers = [],
  routes = [],
  store = null,
  followId = null,
  styleId = 'streets',
  onStyleChange,
  showLegend = true,
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
        } else {
          // fallback línea recta
          next.push({
            id: route.id,
            color: route.color || '#c00000',
            positions: [
              [route.from.lat, route.from.lng],
              [route.to.lat, route.to.lng],
            ],
          });
        }
      }
      setResolvedRoutes(next);
    })().catch(() => setResolvedRoutes([]));
    return () => { cancelled = true; };
  }, [routes]);

  const markerNodes = useMemo(
    () => markers.filter((m) => m.lat != null && m.lng != null),
    [markers]
  );

  return (
    <div className={`relative z-0 isolate overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom
        className="relative z-0 h-full min-h-[420px] w-full"
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

        {store?.lat != null && store?.lng != null && (
          <Marker
            position={[store.lat, store.lng]}
            icon={makeDivIcon('store', '#2563eb', store.label || 'EL POLLON')}
          >
            <Popup>{store.label || 'Sucursal'}</Popup>
          </Marker>
        )}

        {markerNodes.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={makeDivIcon(m.kind, m.color, m.label)}>
            {m.label ? <Popup>{m.label}</Popup> : null}
          </Marker>
        ))}

        {resolvedRoutes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.positions}
            pathOptions={{ color: route.color, weight: 5, opacity: 0.9 }}
          />
        ))}

        <FollowMarker followId={followId} markers={markerNodes} />
        <MapCenterSync center={center} />
      </MapContainer>

      {mapError && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow">
          Problema cargando tiles. Prueba Calles / Satelite.
        </div>
      )}

      {typeof onStyleChange === 'function' && (
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
      )}

      {showLegend && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-2 sm:flex-row">
          <div className="rounded-xl bg-white/95 px-3 py-2 shadow text-[11px]">
            <p className="mb-1 font-bold uppercase tracking-wide text-gray-500">Hacia sucursal</p>
            <div className="flex gap-2">
              {PICKUP_COLORS.map((c) => (
                <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white/95 px-3 py-2 shadow text-[11px]">
            <p className="mb-1 font-bold uppercase tracking-wide text-gray-500">Hacia cliente</p>
            <div className="flex gap-2">
              {DELIVERY_COLORS.map((c) => (
                <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
