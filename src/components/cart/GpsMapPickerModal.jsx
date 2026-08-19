import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, LocateFixed, MapPin, Navigation, X } from 'lucide-react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocodePrecise, precisionHint } from '../../utils/addressGeocode';
import { locateWithPrecisePermission, gpsErrorMessage } from '../../utils/gpsLocation';

const DEFAULT_ZOOM = 19;
const MAX_ZOOM = 21;

function MapSync({ center, recenterToken }) {
  const map = useMap();

  useEffect(() => {
    if (!center?.lat || !center?.lng) return;
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
  }, [map, center?.lat, center?.lng]);

  useEffect(() => {
    if (!recenterToken || !center?.lat || !center?.lng) return;
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), DEFAULT_ZOOM), { duration: 0.45 });
  }, [map, center?.lat, center?.lng, recenterToken]);

  useEffect(() => {
    const run = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore
      }
    };
    run();
    const t1 = setTimeout(run, 80);
    const t2 = setTimeout(run, 260);
    window.addEventListener('resize', run);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', run);
    };
  }, [map]);

  return null;
}

function MapMoveWatcher({ onCenterChange }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });

  useEffect(() => {
    const c = map.getCenter();
    onCenterChange({ lat: c.lat, lng: c.lng });
  }, [map, onCenterChange]);

  return null;
}

function FixedPin() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[700] flex items-center justify-center">
      <div className="relative -translate-y-9">
        <div className="absolute left-1/2 top-[96%] h-4 w-4 -translate-x-1/2 rounded-full bg-black/20 blur-md" />
        <div className="relative flex flex-col items-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-pollon-red text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
            <MapPin className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="-mt-1 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[16px] border-l-transparent border-r-transparent border-t-pollon-red drop-shadow-[0_6px_10px_rgba(0,0,0,0.25)]" />
          <div className="-mt-[1px] h-4.5 w-[2px] rounded-full bg-white/95" />
          <div className="-mt-[1px] h-3 w-[3px] rounded-full bg-pollon-red" />
          <div className="mt-[1px] h-2.5 w-2.5 rounded-full border border-white bg-pollon-red shadow-[0_0_0_2px_rgba(255,255,255,0.30)]" />
          <div className="absolute left-1/2 top-[calc(100%+14px)] h-5 w-5 -translate-x-1/2 rounded-full border border-white/60 bg-white/18" />
          <div className="absolute left-1/2 top-[calc(100%+16px)] h-[1px] w-7 -translate-x-1/2 bg-white/85" />
          <div className="absolute left-1/2 top-[calc(100%+16px)] h-7 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-white/85" />
          <div className="absolute left-1/2 top-[calc(100%+16px)] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pollon-red shadow-[0_0_0_2px_rgba(255,255,255,0.92)]" />
        </div>
      </div>
    </div>
  );
}

export function GpsMapPickerModal({
  open,
  initialCenter,
  onClose,
  onConfirm,
}) {
  const [center, setCenter] = useState(initialCenter);
  const [recenterToken, setRecenterToken] = useState(0);
  const [draft, setDraft] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCenter(initialCenter || null);
    setDraft(null);
    setError('');
    setGpsAccuracy(null);
  }, [open, initialCenter?.lat, initialCenter?.lng]);

  useEffect(() => {
    if (!open || !center?.lat || !center?.lng) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingAddress(true);
      setError('');
      try {
        const geo = await reverseGeocodePrecise(center.lat, center.lng, {
          accuracy: Number.isFinite(gpsAccuracy) ? gpsAccuracy : 18,
        });
        if (!cancelled) {
          setDraft(geo ? { ...geo, lat: center.lat, lng: center.lng, source: 'gps' } : null);
        }
      } catch (err) {
        if (!cancelled) {
          setDraft(null);
          setError(err?.message || 'No se pudo leer la dirección del punto seleccionado.');
        }
      } finally {
        if (!cancelled) setLoadingAddress(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, center?.lat, center?.lng, gpsAccuracy]);

  const label = useMemo(() => {
    if (!draft?.shortLabel) return '';
    return draft.shortLabel;
  }, [draft]);

  const canConfirm = !!(draft?.road && draft?.houseNumber);

  const handleRecenter = async () => {
    if (loadingGps) return;
    setLoadingGps(true);
    setError('');
    try {
      const pos = await locateWithPrecisePermission({
        onImprove: (p) => setGpsAccuracy(p?.coords?.accuracy ?? null),
        onProgress: (p) => setGpsAccuracy(p?.coords?.accuracy ?? null),
      });
      setGpsAccuracy(pos?.coords?.accuracy ?? null);
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCenter(next);
      setRecenterToken((v) => v + 1);
    } catch (err) {
      setError(gpsErrorMessage(err));
    } finally {
      setLoadingGps(false);
    }
  };

  const body = open ? (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gps-map-picker-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[1.1rem] bg-white shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 bg-[#0b0b0b] px-4 py-3.5 text-white">
          <div className="min-w-0">
            <h3 id="gps-map-picker-title" className="text-base font-extrabold tracking-[0.01em]">
              Selecciona tu ubicación exacta
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-white/75">
              Mueve el mapa hasta dejar la aguja sobre tu puerta o entrada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar selector de mapa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative h-[58vh] min-h-[360px] bg-slate-200">
          {center?.lat && center?.lng ? (
            <MapContainer
              center={[center.lat, center.lng]}
              zoom={DEFAULT_ZOOM}
              maxZoom={MAX_ZOOM}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
                maxZoom={MAX_ZOOM}
              />
              <MapSync center={center} recenterToken={recenterToken} />
              <MapMoveWatcher onCenterChange={setCenter} />
            </MapContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-600">
              Cargando mapa...
            </div>
          )}

          <FixedPin />

          <button
            type="button"
            onClick={handleRecenter}
            className="absolute bottom-4 right-4 z-[800] flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
            aria-label="Volver a mi ubicación GPS"
            title="Volver a mi ubicación GPS"
          >
            {loadingGps ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
          </button>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <div className="rounded-[0.8rem] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700">
                <LocateFixed className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-800">
                  Punto seleccionado
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                  {loadingAddress ? 'Leyendo calle y número...' : (label || 'Mueve el mapa para detectar la dirección')}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600">
                  {error
                    || (draft?.precision
                      ? precisionHint(draft.precision)
                      : 'Confirma solo cuando aparezca calle y número completos.')}
                  {gpsAccuracy != null ? ` Precisión GPS: ${Math.round(gpsAccuracy)} m.` : ''}
                </p>
              </div>
            </div>
          </div>

          {!canConfirm && !loadingAddress && (
            <p className="mt-2 text-[11px] leading-snug text-amber-700">
              Aún no hay número de casa confirmado. Acerca más el mapa o mueve la aguja al punto exacto.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[0.8rem] border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canConfirm || loadingAddress}
              onClick={() => canConfirm && onConfirm?.({ ...draft, lat: center.lat, lng: center.lng, source: 'gps' })}
              className="rounded-[0.8rem] bg-[#c6ff11] px-3 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:bg-[#b5ec10] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!body || typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
