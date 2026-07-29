import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

/**
 * Autocompletado de dirección usando Nominatim (OpenStreetMap) — 100% gratis.
 * Al seleccionar guarda { label, lat, lng } en el padre vía onSelect.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

async function searchAddress(query, countryCode = 'cl') {
  const url = new URL(NOMINATIM);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '7');
  url.searchParams.set('countrycodes', countryCode);
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Language': 'es' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((r) => ({
    id: r.place_id,
    label: r.display_name,
    shortLabel: buildShortLabel(r),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    type: r.type,
  }));
}

function buildShortLabel(r) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway || '';
  const house = a.house_number || '';
  const city = a.city || a.town || a.village || a.municipality || '';
  const region = a.state || '';
  const parts = [road && house ? `${road} ${house}` : road || house, city, region].filter(Boolean);
  return parts.join(', ') || r.display_name;
}

export function AddressAutocomplete({ value, onChange, onSelect, required, disabled }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  // Si el padre resetea value (p.ej. al limpiar el carrito) limpiamos estado
  useEffect(() => {
    if (!value) {
      setQuery('');
      setSelected(false);
      setSuggestions([]);
      setOpen(false);
    }
  }, [value]);

  const search = useCallback((q) => {
    clearTimeout(timerRef.current);
    if (q.trim().length < 4) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchAddress(q);
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 420);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    onChange?.(q, null);
    search(q);
  };

  const handleSelect = (item) => {
    setQuery(item.shortLabel);
    setSelected(true);
    setOpen(false);
    setSuggestions([]);
    onChange?.(item.shortLabel, item);
    onSelect?.(item);
  };

  const handleClear = () => {
    setQuery('');
    setSelected(false);
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

  // Cierra al clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll al item activo
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

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition ${borderColor} bg-white`}>
        <MapPin className={`h-4 w-4 flex-none ${selected ? 'text-green-500' : 'text-gray-400'}`} />
        <input
          ref={inputRef}
          type="text"
          required={required}
          disabled={disabled}
          placeholder="Dirección de entrega (calle + número)"
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

      {/* Hint bajo el campo */}
      {!selected && query.length >= 4 && !loading && suggestions.length === 0 && (
        <p className="mt-1 text-xs text-amber-700 px-1">
          No se encontraron resultados. Intenta agregar la ciudad, ej: "Vivar 1086, Iquique".
        </p>
      )}
      {selected && (
        <p className="mt-1 flex items-center gap-1 text-xs text-green-700 px-1">
          <span>✔</span> Dirección confirmada en el mapa
        </p>
      )}
      {!selected && query.length > 0 && query.length < 4 && (
        <p className="mt-1 text-xs text-gray-400 px-1">Escribe al menos 4 caracteres para buscar…</p>
      )}

      {/* Lista de sugerencias */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-[200] mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={activeIdx === idx}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition ${
                activeIdx === idx ? 'bg-red-50 text-pollon-red' : 'hover:bg-gray-50 text-gray-800'
              }`}
            >
              <MapPin className="mt-0.5 h-4 w-4 flex-none text-pollon-red" aria-hidden />
              <span className="leading-snug">
                <span className="font-medium">{s.shortLabel.split(',')[0]}</span>
                {s.shortLabel.includes(',') && (
                  <span className="text-gray-500">{s.shortLabel.slice(s.shortLabel.indexOf(','))}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
