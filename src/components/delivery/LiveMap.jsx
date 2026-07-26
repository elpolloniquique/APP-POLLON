import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, GeolocateControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '../../utils/mapStyles';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../utils/geo';
import { fetchOsrmRoute } from '../../utils/osrm';

/**
 * Mapa live MapLibre + tiles CARTO/Esri gratis.
 * markers: [{ id, lat, lng, label, color, kind }]
 * routes: [{ id, from:{lat,lng}, to:{lat,lng}, color }]
 */
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
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new Map({
      container: containerRef.current,
      style: getMapStyle(styleId),
      center: [center.lng, center.lat],
      zoom,
      attributionControl: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });

    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right'
    );

    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
      // Asegura render correcto en contenedores flex/modal
      requestAnimationFrame(() => map.resize());
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.resize())
      : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(getMapStyle(styleId));
  }, [styleId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const nextIds = new Set(markers.map((m) => m.id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!nextIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    markers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const el = document.createElement('div');
      el.className = 'ep-map-marker';
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 9999px;
        background: ${m.color || '#c00000'};
        border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35);
        display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:11px; font-weight:700;
      `;
      el.textContent = m.kind === 'driver' ? '🛵' : m.kind === 'store' ? 'P' : '📍';
      el.title = m.label || '';

      if (markersRef.current[m.id]) {
        markersRef.current[m.id].setLngLat([m.lng, m.lat]);
      } else {
        markersRef.current[m.id] = new Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .setPopup(m.label ? new Popup({ offset: 18 }).setText(m.label) : undefined)
          .addTo(map);
      }
    });

    if (followId) {
      const target = markers.find((m) => m.id === followId);
      if (target?.lat != null) {
        map.easeTo({ center: [target.lng, target.lat], duration: 600 });
      }
    }
  }, [markers, ready, followId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    let cancelled = false;

    async function drawRoutes() {
      const existing = map.getStyle()?.layers?.map((l) => l.id) || [];
      existing.filter((id) => id.startsWith('ep-route-')).forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      Object.keys(map.getStyle()?.sources || {}).forEach((id) => {
        if (id.startsWith('ep-route-') && map.getSource(id)) map.removeSource(id);
      });

      for (const route of routes) {
        if (!route?.from || !route?.to) continue;
        const result = await fetchOsrmRoute(route.from, route.to);
        if (cancelled || !result?.coordinates?.length) continue;
        const sourceId = `ep-route-${route.id}`;
        const layerId = `ep-route-layer-${route.id}`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: result.coordinates },
            },
          });
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': route.color || '#c00000',
              'line-width': 4,
              'line-opacity': 0.85,
            },
          });
        }
      }
    }

    drawRoutes();
    return () => { cancelled = true; };
  }, [routes, ready]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[320px] w-full" />
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
            {id === 'streets' ? 'Calles' : 'Satélite'}
          </button>
        ))}
      </div>
    </div>
  );
}
