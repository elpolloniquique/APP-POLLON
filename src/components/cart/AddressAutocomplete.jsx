import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2, X, Crosshair, LocateFixed } from 'lucide-react';
import {
  searchAddressesProgressive,
  reverseGeocodePrecise,
  parseAddressQuery,
  previewLocalAddresses,
} from '../../utils/addressGeocode';
import {
  gpsErrorMessage,
  locateWithPrecisePermission,
  ADDRESS_LIST_HINT,
} from '../../utils/gpsLocation';

/**
 * Autocompletado de dirección preciso (calle + número + CP + coords).
 * GPS: rellena la dirección exacta del cliente para cotizar delivery.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  required,
  disabled,
  cityBias = 'Iquique',
  biasLat,
  biasLng,
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsPhase, setGpsPhase] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const [selectedPrecision, setSelectedPrecision] = useState(null);
  const [fromGps, setFromGps] = useState(false);
  const [askGps, setAskGps] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!value) {
      setQuery('');
      setSelected(false);
      setSelectedPrecision(null);
      setFromGps(false);
      setSuggestions([]);
      setOpen(false);
    }
  }, [value]);

  const search = useCallback((q) => {
    clearTimeout(timerRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const opts = {
      city: cityBias,
      lat: biasLat,
      lng: biasLng,
      limit: 8,
    };

    const localNow = previewLocalAddresses(q, opts);
    if (localNow.length) {
      setSuggestions(localNow);
      setOpen(true);
      setActiveIdx(0);
    }

    const applyHits = (hits, reqId) => {
      if (reqId !== reqIdRef.current) return;
      const list = hits || [];
      if (!list.length && localNow.length) return;
      setSuggestions(list.length ? list : localNow);
      setOpen((list.length ? list : localNow).length > 0);
      setActiveIdx((list.length ? list : localNow).length ? 0 : -1);
    };

    const reqId = ++reqIdRef.current;
    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        await searchAddressesProgressive(q, opts, (hits) => applyHits(hits, reqId));
      } catch {
        if (reqId === reqIdRef.current && !localNow.length) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, 140);
  }, [cityBias, biasLat, biasLng]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    setSelectedPrecision(null);
    setFromGps(false);
    setGpsError('');
    onChange?.(q, null);
    search(q);
  };

  const handleSelect = (item) => {
    setQuery(item.shortLabel);
    setSelected(true);
    setSelectedPrecision(item.precision);
    setFromGps(item.source === 'gps');
    setOpen(false);
    setSuggestions([]);
    setGpsError('');
    onChange?.(item.shortLabel, item);
    onSelect?.(item);
  };

  const handleClear = () => {
    setQuery('');
    setSelected(false);
    setSelectedPrecision(null);
    setFromGps(false);
    setSuggestions([]);
    setOpen(false);
    setGpsError('');
    onChange?.('', null);
    onSelect?.(null);
    inputRef.current?.focus();
  };

  const handleUseGps = () => {
    if (disabled || gpsLoading) return;
    setGpsError('');
    setAskGps(true);
  };

  const handleAllowPreciseGps = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (disabled || gpsLoading) return;
    setAskGps(false);
    setGpsError('');
    setGpsLoading(true);
    setGpsPhase('permission');
    setGpsAccuracy(null);
    try {
      const pos = await locateWithPrecisePermission({
        onProgress: (p) => {
          setGpsPhase('reading');
          setGpsAccuracy(p?.coords?.accuracy ?? null);
        },
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setGpsAccuracy(pos.coords.accuracy ?? null);
      setGpsPhase('geocoding');
      const geo = await reverseGeocodePrecise(lat, lng, { accuracy: pos.coords.accuracy });
      if (!geo) throw new Error('No se pudo leer la dirección de esta ubicación.');
      const item = {
        ...geo,
        lat,
        lng,
        source: 'gps',
        precision: geo.houseNumber ? (geo.precision || 'exact') : 'street',
      };
      handleSelect(item);
    } catch (err) {
      setGpsError(gpsErrorMessage(err));
    } finally {
      setGpsLoading(false);
      setGpsPhase('');
      setGpsAccuracy(null);
    }
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll('li')[activeIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const parsed = parseAddressQuery(query);
  const borderColor = selected
    ? 'border-green-500 ring-2 ring-green-200'
    : query && !selected && !loading && !gpsLoading
      ? 'border-amber-400'
      : 'border-gray-200';

  const primaryLine = (label) => {
    const i = label.indexOf(',');
    return i === -1 ? label : label.slice(0, i);
  };
  const secondaryLine = (label) => {
    const i = label.indexOf(',');
    return i === -1 ? '' : label.slice(i + 1).trim();
  };

  const highlightMatch = (text) => {
    const needle = (parsed.street || query).trim();
    if (!needle || needle.length < 2) return text;
    const idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-amber-100 px-0.5 font-extrabold text-pollon-black">{text.slice(idx, idx + needle.length)}</mark>
        {text.slice(idx + needle.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex min-h-[2.45rem] items-center gap-1.5 rounded-[0.7rem] border px-2.5 py-[0.4rem] transition ${borderColor} bg-white`}>
        <MapPin className={`h-4 w-4 flex-none ${selected ? 'text-green-500' : 'text-gray-400'}`} />
        <input
          ref={inputRef}
          type="text"
          required={required}
          disabled={disabled || gpsLoading}
          placeholder="Ej: Sotomayor 785, Iquique"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-label="Dirección de entrega"
        />
        {(loading || gpsLoading) && <Loader2 className="h-4 w-4 animate-spin text-gray-400 flex-none" />}
        {query && !loading && !gpsLoading && (
          <button type="button" onClick={handleClear} className="flex-none rounded-md p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Limpiar">
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleUseGps}
          disabled={disabled || gpsLoading}
          title="Usar ubicación precisa del teléfono"
          aria-label="Pedir permiso de GPS preciso y completar calle y número"
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg transition disabled:opacity-50 ${
            fromGps
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-red-50 text-pollon-red hover:bg-pollon-red hover:text-white'
          }`}
        >
          <LocateFixed className="h-4 w-4" strokeWidth={2.3} />
        </button>
      </div>

      {gpsLoading && (
        <p className="mt-1 px-0.5 text-[11px] leading-snug text-gray-600">
          {gpsPhase === 'permission' && 'Permite la ubicación precisa en el aviso del teléfono…'}
          {gpsPhase === 'reading' && 'GPS activado — cargando tu dirección…'}
          {gpsPhase === 'geocoding' && 'Completando calle y número…'}
          {!gpsPhase && 'Obteniendo tu dirección exacta…'}
        </p>
      )}
      {!gpsLoading && (
        <p
          className={`mt-1 flex items-start gap-1.5 px-0.5 text-[11px] leading-snug ${
            gpsError ? 'text-red-600' : selected ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          {selected && <Crosshair className="mt-0.5 h-3 w-3 shrink-0" />}
          <span>{gpsError || ADDRESS_LIST_HINT}</span>
        </p>
      )}

      {askGps && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gps-perm-title"
          onClick={() => setAskGps(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-pollon-red">
              <LocateFixed className="h-6 w-6" strokeWidth={2.3} />
            </div>
            <h3 id="gps-perm-title" className="text-center text-base font-extrabold text-pollon-black">
              Ubicación precisa
            </h3>
            <p className="mt-2 text-center text-[13px] leading-snug text-gray-600">
              Para completar tu dirección exacta (calle y número de casa) necesitamos el GPS preciso de tu teléfono, no una ubicación aproximada.
            </p>
            <p className="mt-2 text-center text-[12px] leading-snug text-gray-500">
              En el aviso del celular elige <span className="font-semibold text-gray-700">Permitir</span> y, si aparece, <span className="font-semibold text-gray-700">Ubicación precisa</span>.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAskGps(false)}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAllowPreciseGps}
                className="rounded-xl bg-pollon-red px-3 py-2.5 text-sm font-extrabold text-white hover:bg-red-700"
              >
                Permitir GPS
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-[200] mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={activeIdx === idx}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex cursor-pointer items-start gap-3 border-b border-gray-50 px-3.5 py-2.5 text-sm last:border-0 transition ${
                activeIdx === idx ? 'bg-red-50' : 'hover:bg-gray-50'
              }`}
            >
              <MapPin
                className={`mt-0.5 h-4 w-4 flex-none ${
                  s.precision === 'exact' || s.precision === 'interpolated'
                    ? 'text-pollon-red'
                    : 'text-gray-400'
                }`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-semibold text-gray-900">{highlightMatch(primaryLine(s.shortLabel))}</span>
                {secondaryLine(s.shortLabel) && (
                  <span className="mt-0.5 block text-[12px] text-gray-500">{secondaryLine(s.shortLabel)}</span>
                )}
                <span className="mt-1 inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {s.precision === 'exact' && 'Exacto'}
                  {s.precision === 'interpolated' && 'Por número de casa'}
                  {s.precision === 'street' && 'Calle'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
