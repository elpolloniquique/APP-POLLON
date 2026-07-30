/**
 * Geocoding preciso para Chile (calle + número + CP).
 * Fuentes gratis: Nominatim + Photon + Overpass (interpolación por nº de casa).
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON = 'https://photon.komoot.io/api/';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const FETCH_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'es',
  // Nominatim exige identificación; en navegador este header se ignora (usa el UA real).
  'User-Agent': 'ElPollonApp/1.0 (delivery; https://www.el-pollon.cl)',
};

/** Iquique approx viewbox: west,south,east,north */
const DEFAULT_VIEWBOX = '-70.22,-20.30,-70.08,-20.15';

/**
 * @typedef {{ street: string, houseNumber: string|null, postcode: string|null, city: string|null, region: string|null, rest: string }} ParsedAddress
 * @typedef {{ id: string, label: string, shortLabel: string, lat: number, lng: number, precision: 'exact'|'interpolated'|'street', houseNumber: string|null, postcode: string|null, road: string, city: string, state: string }} GeocodeHit
 */

export function parseAddressQuery(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return { street: '', houseNumber: null, postcode: null, city: null, region: null, rest: '' };
  }

  const postcodeMatch = text.match(/\b(\d{7})\b/);
  const postcode = postcodeMatch ? postcodeMatch[1] : null;

  let working = text;
  if (postcode) working = working.replace(postcode, ' ').replace(/\s+/g, ' ').trim();

  // Quita "Chile" / región genérica del final para parsear mejor
  working = working
    .replace(/,?\s*chile\s*$/i, '')
    .replace(/,?\s*regi[oó]n\s+de\s+tarapac[aá]\s*$/i, '')
    .replace(/,?\s*tarapac[aá]\s*$/i, '')
    .trim();

  const parts = working.split(',').map((p) => p.trim()).filter(Boolean);
  const head = parts[0] || working;
  const tail = parts.slice(1);

  let city = null;
  let region = null;
  for (const t of tail) {
    if (/tarapac/i.test(t) || /regi[oó]n/i.test(t)) region = t;
    else if (!city) city = t.replace(/\b\d{7}\b/, '').trim() || city;
  }

  // "Calle Foo 123" | "Foo 123" | "123 Foo"
  let street = head;
  let houseNumber = null;

  const m1 = head.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*$/);
  const m2 = head.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (m1) {
    street = m1[1].replace(/^(calle|av\.?|avenida|pasaje|psje\.?)\s+/i, '').trim();
    houseNumber = m1[2];
  } else if (m2 && !/^\d{7}$/.test(m2[1])) {
    houseNumber = m2[1];
    street = m2[2].replace(/^(calle|av\.?|avenida|pasaje|psje\.?)\s+/i, '').trim();
  } else {
    street = head.replace(/^(calle|av\.?|avenida|pasaje|psje\.?)\s+/i, '').trim();
  }

  return {
    street,
    houseNumber,
    postcode,
    city: city || null,
    region: region || null,
    rest: text,
  };
}

function shortState(state) {
  if (!state) return '';
  return String(state)
    .replace(/^Regi[oó]n\s+de\s+/i, '')
    .replace(/^Provincia\s+de\s+/i, '')
    .trim();
}

function normText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function streetsMatch(a, b) {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.split(/\s+/).some((w) => w.length > 3 && nb.includes(w));
}

/**
 * Etiqueta estilo Chile: "Bartolomé Vivar 1086, 1101063 Iquique, Tarapacá"
 */
export function formatChileLabel({
  road,
  houseNumber,
  postcode,
  city,
  state,
  neighbourhood,
}) {
  const line1 = [road, houseNumber].filter(Boolean).join(' ').trim();
  const cityPart = [postcode, city].filter(Boolean).join(' ').trim();
  const region = shortState(state);
  const parts = [line1 || neighbourhood, cityPart, region].filter(Boolean);
  return parts.join(', ');
}

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Interpola / extrapola lat-lng con regresión lineal sobre números conocidos.
 * Opcionalmente recorta al bounding box de la calle (Nominatim: S,N,W,E).
 * @param {number} target
 * @param {{ n: number, lat: number, lng: number }[]} known
 * @param {string[]|number[]|null} [bbox]
 */
export function interpolateHouseCoords(target, known, bbox = null) {
  if (!Number.isFinite(target) || !known?.length) return null;
  const sorted = [...known].filter((k) => Number.isFinite(k.n)).sort((a, b) => a.n - b.n);
  if (!sorted.length) return null;

  const exact = sorted.find((k) => k.n === target);
  if (exact) return { lat: exact.lat, lng: exact.lng, precision: 'exact' };

  let lower = null;
  let upper = null;
  for (const k of sorted) {
    if (k.n < target) lower = k;
    if (k.n > target && !upper) upper = k;
  }

  let lat;
  let lng;

  if (lower && upper) {
    const t = (target - lower.n) / (upper.n - lower.n);
    lat = lower.lat + (upper.lat - lower.lat) * t;
    lng = lower.lng + (upper.lng - lower.lng) * t;
  } else if (sorted.length >= 2) {
    // Regresión lineal n → lat/lng (más estable que 2 puntos casi iguales)
    const fit = (key) => {
      const n = sorted.length;
      const sumX = sorted.reduce((s, k) => s + k.n, 0);
      const sumY = sorted.reduce((s, k) => s + k[key], 0);
      const sumXY = sorted.reduce((s, k) => s + k.n * k[key], 0);
      const sumXX = sorted.reduce((s, k) => s + k.n * k.n, 0);
      const den = n * sumXX - sumX * sumX;
      if (Math.abs(den) < 1e-9) return sumY / n;
      const slope = (n * sumXY - sumX * sumY) / den;
      const intercept = (sumY - slope * sumX) / n;
      return slope * target + intercept;
    };
    lat = fit('lat');
    lng = fit('lng');

    // Si la extrapolación se va muy lejos del tramo conocido, acota a ±250 m del extremo
    const edge = lower ? sorted[sorted.length - 1] : sorted[0];
    const dist = haversineM({ lat, lng }, edge);
    if (dist > 250) {
      const t = 250 / dist;
      lat = edge.lat + (lat - edge.lat) * t;
      lng = edge.lng + (lng - edge.lng) * t;
    }
  } else {
    const only = sorted[0];
    const meters = (target - only.n) * 0.9;
    const dLat = meters / 111320;
    lat = only.lat + dLat;
    lng = only.lng;
  }

  if (bbox?.length === 4) {
    const south = Number(bbox[0]);
    const north = Number(bbox[1]);
    const west = Number(bbox[2]);
    const east = Number(bbox[3]);
    const padLat = (north - south) * 0.35 || 0.002;
    const padLng = (east - west) * 0.35 || 0.002;
    lat = Math.min(north + padLat, Math.max(south - padLat, lat));
    lng = Math.min(east + padLng, Math.max(west - padLng, lng));
  }

  return { lat, lng, precision: 'interpolated' };
}

async function nominatimSearch(params) {
  const url = new URL(NOMINATIM);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'cl');
  try {
    const res = await fetch(url.toString(), { headers: FETCH_HEADERS });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.startsWith('Access denied')) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function photonSearch(query, { lat, lng, limit = 7 } = {}) {
  const url = new URL(PHOTON);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
  }
  try {
    const res = await fetch(url.toString(), { headers: FETCH_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.features || [];
  } catch {
    return [];
  }
}

function mapNominatimHit(r, parsed) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway || a.neighbourhood || r.name || '';
  const osmHouse = a.house_number || null;
  const houseNumber = osmHouse || parsed.houseNumber || null;
  const postcode = parsed.postcode || a.postcode || null;
  const city = a.city || a.town || a.village || a.municipality || parsed.city || '';
  const state = a.state || parsed.region || '';
  const shortLabel = formatChileLabel({
    road,
    houseNumber,
    postcode,
    city,
    state,
    neighbourhood: a.neighbourhood,
  });
  const hasExactHouse = !!(osmHouse && parsed.houseNumber && String(osmHouse) === String(parsed.houseNumber));
  return {
    id: `nom-${r.place_id}`,
    placeId: r.place_id,
    osmType: r.osm_type,
    osmId: r.osm_id,
    label: shortLabel,
    shortLabel,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    precision: hasExactHouse ? 'exact' : osmHouse ? 'exact' : 'street',
    houseNumber,
    postcode,
    road,
    city,
    state,
    boundingbox: r.boundingbox,
    source: 'nominatim',
  };
}

function mapPhotonHit(f, parsed) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const road = p.name || p.street || '';
  const osmHouse = p.housenumber || null;
  const houseNumber = osmHouse || parsed.houseNumber || null;
  const postcode = parsed.postcode || p.postcode || null;
  const city = p.city || parsed.city || '';
  const state = p.state || parsed.region || '';
  const shortLabel = formatChileLabel({
    road: p.street || road,
    houseNumber,
    postcode,
    city,
    state,
  });
  // Preferir "street" type with house in query over bus stops named like streets
  const isBusStop = p.osm_key === 'highway' && p.osm_value === 'bus_stop';
  if (isBusStop && !osmHouse) return null;
  return {
    id: `pho-${p.osm_type}-${p.osm_id}`,
    osmType: p.osm_type === 'W' ? 'way' : p.osm_type === 'N' ? 'node' : 'relation',
    osmId: p.osm_id,
    label: shortLabel,
    shortLabel,
    lat: Number(lat),
    lng: Number(lng),
    precision: osmHouse ? 'exact' : 'street',
    houseNumber,
    postcode,
    road: p.street || road,
    city,
    state,
    source: 'photon',
  };
}

async function fetchStreetHouseNumbers(streetName, near) {
  if (!streetName || !near?.lat || !near?.lng) return [];
  // Usar el token más distintivo (última palabra > 3 chars) para tolerar acentos/prefijos
  const tokens = normText(streetName).split(/\s+/).filter((t) => t.length > 3);
  const token = tokens[tokens.length - 1] || normText(streetName).slice(0, 40);
  if (!token) return [];

  const q = `
[out:json][timeout:20];
(
  node["addr:housenumber"]["addr:street"~"${token}",i](around:2500,${near.lat},${near.lng});
  way["addr:housenumber"]["addr:street"~"${token}",i](around:2500,${near.lat},${near.lng});
);
out center 80;
`.trim();

  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', ...FETCH_HEADERS },
      body: new URLSearchParams({ data: q }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements || [])
      .map((el) => {
        const n = parseInt(String(el.tags?.['addr:housenumber'] || '').replace(/\D.*/, ''), 10);
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!Number.isFinite(n) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { n, lat: Number(lat), lng: Number(lng), street: el.tags?.['addr:street'] || streetName };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function dedupeHits(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (!h || !Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
    const key = `${h.shortLabel}|${h.lat.toFixed(5)}|${h.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

function rankHits(hits, parsed, bias) {
  return [...hits].sort((a, b) => {
    const score = (h) => {
      let s = 0;
      if (h.precision === 'exact') s += 100;
      if (h.precision === 'interpolated') s += 70;
      if (parsed.houseNumber && h.houseNumber === parsed.houseNumber) s += 40;
      if (parsed.postcode && h.postcode === parsed.postcode) s += 15;
      if (bias?.lat && bias?.lng) {
        const d = haversineM({ lat: h.lat, lng: h.lng }, { lat: bias.lat, lng: bias.lng });
        s += Math.max(0, 30 - d / 200);
      }
      return s;
    };
    return score(b) - score(a);
  });
}

/**
 * Busca direcciones precisas para autocompletado / checkout.
 * @param {string} query
 * @param {{ city?: string, lat?: number, lng?: number, limit?: number }} [opts]
 * @returns {Promise<GeocodeHit[]>}
 */
export async function searchPreciseAddresses(query, opts = {}) {
  const parsed = parseAddressQuery(query);
  if ((parsed.street || parsed.rest).length < 3) return [];

  const city = opts.city || parsed.city || 'Iquique';
  const bias = {
    lat: opts.lat != null ? Number(opts.lat) : -20.23,
    lng: opts.lng != null ? Number(opts.lng) : -70.14,
  };
  const limit = opts.limit || 7;

  const freeQ = [
    parsed.houseNumber ? `${parsed.street} ${parsed.houseNumber}` : parsed.street,
    parsed.postcode,
    city,
    'Chile',
  ]
    .filter(Boolean)
    .join(', ');

  const streetParam = parsed.houseNumber
    ? `${parsed.houseNumber} ${parsed.street}`
    : parsed.street;

  const [nomFree, nomStruct, photon] = await Promise.all([
    nominatimSearch({
      q: freeQ,
      limit: String(limit),
      viewbox: DEFAULT_VIEWBOX,
      bounded: '0',
    }).catch(() => []),
    nominatimSearch({
      street: streetParam,
      city,
      country: 'Chile',
      postalcode: parsed.postcode || undefined,
      limit: String(limit),
    }).catch(() => []),
    photonSearch(freeQ, bias).catch(() => []),
  ]);

  let hits = [
    ...nomFree.map((r) => mapNominatimHit(r, parsed)),
    ...nomStruct.map((r) => mapNominatimHit(r, parsed)),
    ...photon.map((f) => mapPhotonHit(f, parsed)).filter(Boolean),
  ];

  hits = dedupeHits(hits);

  // Enriquecer con Overpass si el usuario escribió número de casa
  const targetNum = parsed.houseNumber
    ? parseInt(String(parsed.houseNumber).replace(/\D.*/, ''), 10)
    : null;

  if (Number.isFinite(targetNum) && hits.length) {
    // Preferir el tramo de calle más cercano a la sucursal y que coincida con lo escrito
    const streetCandidates = hits
      .filter((h) => h.road && streetsMatch(h.road, parsed.street || h.road))
      .sort((a, b) => {
        const da = haversineM({ lat: a.lat, lng: a.lng }, bias);
        const db = haversineM({ lat: b.lat, lng: b.lng }, bias);
        return da - db;
      });
    const near = streetCandidates[0] || hits.find((h) => h.road) || hits[0];
    const roadName = near.road || parsed.street;
    const known = await fetchStreetHouseNumbers(roadName, near);
    const bbox = near.boundingbox || null;

    if (known.length) {
      const exactKnown = known.find((k) => k.n === targetNum);
      const interp = exactKnown
        ? { lat: exactKnown.lat, lng: exactKnown.lng, precision: 'exact' }
        : interpolateHouseCoords(targetNum, known, bbox);

      if (interp) {
        const label = formatChileLabel({
          road: roadName,
          houseNumber: String(parsed.houseNumber),
          postcode: parsed.postcode || near.postcode,
          city: near.city || city,
          state: near.state || 'Tarapacá',
        });
        const enriched = {
          id: `prec-${normText(roadName)}-${targetNum}`,
          label,
          shortLabel: label,
          lat: interp.lat,
          lng: interp.lng,
          precision: interp.precision,
          houseNumber: String(parsed.houseNumber),
          postcode: parsed.postcode || near.postcode,
          road: roadName,
          city: near.city || city,
          state: near.state || 'Tarapacá',
          source: 'overpass',
        };
        hits = [
          enriched,
          ...hits.map((h) => {
            if (!parsed.houseNumber) return h;
            const sameStreet = streetsMatch(h.road, roadName) || streetsMatch(h.road, parsed.street);
            const nextLabel = formatChileLabel({
              road: h.road,
              houseNumber: String(parsed.houseNumber),
              postcode: parsed.postcode || h.postcode,
              city: h.city,
              state: h.state,
            });
            return {
              ...h,
              houseNumber: String(parsed.houseNumber),
              postcode: parsed.postcode || h.postcode,
              shortLabel: nextLabel,
              label: nextLabel,
              ...(sameStreet
                ? { lat: interp.lat, lng: interp.lng, precision: interp.precision }
                : {}),
            };
          }),
        ];
        hits = dedupeHits(hits);
      }
    } else if (parsed.houseNumber) {
      // Sin puntos OSM: aún así muestra número + CP en la etiqueta (coords de calle)
      hits = hits.map((h) => {
        const nextLabel = formatChileLabel({
          road: h.road,
          houseNumber: String(parsed.houseNumber),
          postcode: parsed.postcode || h.postcode,
          city: h.city || city,
          state: h.state,
        });
        return {
          ...h,
          houseNumber: String(parsed.houseNumber),
          postcode: parsed.postcode || h.postcode,
          shortLabel: nextLabel,
          label: nextLabel,
        };
      });
    }
  }

  return rankHits(hits, parsed, bias).slice(0, limit);
}

export function precisionHint(precision) {
  if (precision === 'exact') return 'Ubicación exacta del número';
  if (precision === 'interpolated') return 'Ubicación estimada por número de casa';
  return 'Calle confirmada — indica el número para más precisión';
}
