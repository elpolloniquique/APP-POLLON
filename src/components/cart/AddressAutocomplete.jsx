import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2, X, Crosshair } from 'lucide-react';
import { searchPreciseAddresses, precisionHint } from '../../utils/addressGeocode';

/**
 * Autocompletado de dirección preciso (calle + número + CP + coords).
 * Al seleccionar guarda { label, shortLabel, lat, lng, precision } vía onSelect.
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
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const [selectedPrecision, setSelectedPrecision] = useState(null);
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
      setSuggestions([]);
      setOpen(false);
    }
  }, [value]);

  const search = useCallback((q) => {
    clearTimeout(timerRef.current);
    if (q.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const results = await searchPreciseAddresses(q, {
          city: cityBias,
          lat: biasLat,
          lng: biasLng,
          limit: 7,
        });
        if (reqId !== reqIdRef.current) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } catch {
        if (reqId !== reqIdRef.current) return;
        setSuggestions([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, 480);
  }, [cityBias, biasLat, biasLng]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    setSelectedPrecision(null);
    onChange?.(q, null);
    search(q);
  };

  const handleSelect = (item) => {
    setQuery(item.shortLabel);
    setSelected(true);
    setSelectedPrecision(item.precision);
    setOpen(false);
    setSuggestions([]);
    onChange?.(item.shortLabel, item);
    onSelect?.(item);
  };

  const handleClear = () => {
    setQuery('');
    setSelected(false);
    setSelectedPrecision(null);
    setSuggestions([]);
    setOpen(false);
    onChange?.('', null);
    onSelect?.(null);
    inputRef.current?.focus();
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

  const borderColor = selected
    ? 'border-green-500 ring-2 ring-green-200'
    : query && !selected && !loading
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

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition ${borderColor} bg-white`}>
        <MapPin className={`h-4 w-4 flex-none ${selected ? 'text-green-500' : 'text-gray-400'}`} />
        <input
          ref={inputRef}
          type="text"
          required={required}
          disabled={disabled}
          placeholder="Ej: Bartolomé Vivar 1086, Iquique"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400 flex-none" />}
        {query && !loading && (
          <button type="button" onClick={handleClear} className="flex-none text-gray-400 hover:text-gray-700" aria-label="Limpiar">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!selected && query.length >= 4 && !loading && suggestions.length === 0 && (
        <p className="mt-1 px-1 text-xs text-amber-700">
          Sin resultados. Prueba: calle + número + ciudad, ej. &quot;Vivar 1086, Iquique&quot;.
        </p>
      )}
      {selected && (
        <p className="mt-1 flex items-center gap-1.5 px-1 text-xs text-green-700">
          <Crosshair className="h-3.5 w-3.5 shrink-0" />
          {precisionHint(selectedPrecision)} — el repartidor irá a este punto
        </p>
      )}
      {!selected && query.length > 0 && query.length < 4 && (
        <p className="mt-1 px-1 text-xs text-gray-400">Escribe al menos 4 caracteres…</p>
      )}
      {!selected && query.length >= 4 && !/\d/.test(query) && (
        <p className="mt-1 px-1 text-xs text-gray-500">Incluye el número de casa para una ruta exacta.</p>
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
              className={`flex cursor-pointer items-start gap-3 border-b border-gray-50 px-4 py-3 text-sm last:border-0 transition ${
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
                <span className="font-semibold text-gray-900">{primaryLine(s.shortLabel)}</span>
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
