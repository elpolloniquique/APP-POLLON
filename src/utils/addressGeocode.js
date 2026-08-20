/**
 * Geocoding preciso para Chile (calle + número + CP).
 * Fuentes: catálogo local + ArcGIS (GPS exacto) + Photon + Nominatim + Overpass.
 */

import { matchLocalStreets, preferredLocalRoadName } from '../data/cityStreets';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const PHOTON = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const ARCGIS_REVERSE = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode';
const searchCache = new Map();

const FETCH_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'es',
  // Nominatim exige identificación; en navegador este header se ignora (usa el UA real).
  'User-Agent': 'ElPollonApp/1.0 (delivery; https://www.el-pollon.cl)',
};

/** viewbox: west,south,east,north */
const VIEWBOX_BY_CITY = {
  Iquique: '-70.22,-20.32,-70.08,-20.15',
  'Alto Hospicio': '-70.14,-20.32,-70.05,-20.24',
  Arica: '-70.36,-18.54,-70.26,-18.44',
};
const DEFAULT_VIEWBOX = VIEWBOX_BY_CITY.Iquique;

function viewboxForCity(city) {
  const key = Object.keys(VIEWBOX_BY_CITY).find(
    (k) => normText(k) === normText(city),
  );
  return VIEWBOX_BY_CITY[key] || DEFAULT_VIEWBOX;
}

function normalizeBranchCity(city) {
  const n = normText(city);
  if (/hospicio/.test(n)) return 'alto hospicio';
  if (/arica/.test(n)) return 'arica';
  return 'iquique';
}

function viewboxKeyForBranch(city) {
  const branch = normalizeBranchCity(city);
  if (branch === 'alto hospicio') return 'Alto Hospicio';
  if (branch === 'arica') return 'Arica';
  return 'Iquique';
}

function isInViewbox(lat, lng, viewboxStr) {
  const parts = String(viewboxStr || DEFAULT_VIEWBOX).split(',').map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return false;
  const [west, south, east, north] = parts;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

/** Solo direcciones de la comuna/sucursal activa (evita Santiago u otras ciudades). */
function hitMatchesBranchCity(hit, branchCity, bias) {
  if (!Number.isFinite(hit?.lat) || !Number.isFinite(hit?.lng)) return false;

  const blob = normText(`${hit.city || ''} ${hit.state || ''}`);
  if (/santiago|metropolitan|metropolitana|valparaiso|concepcion|temuco|calama|la serena|coquimbo|rancagua|talca/.test(blob)) {
    return false;
  }

  if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lng)) {
    const dM = haversineM({ lat: hit.lat, lng: hit.lng }, bias);
    if (dM > 28000) return false;
  }

  const branch = normalizeBranchCity(branchCity);
  const vb = VIEWBOX_BY_CITY[viewboxKeyForBranch(branchCity)] || DEFAULT_VIEWBOX;
  if (!isInViewbox(hit.lat, hit.lng, vb)) return false;

  if (branch === 'iquique' && /hospicio/.test(blob) && !/iquique/.test(blob)) return false;
  if (branch === 'alto hospicio' && /iquique/.test(blob) && !/hospicio/.test(blob)) {
    if (Number.isFinite(bias?.lat) && haversineM({ lat: hit.lat, lng: hit.lng }, bias) > 9000) return false;
  }

  return true;
}

function filterByBranchCity(hits, branchCity, bias) {
  return (hits || []).filter((h) => hitMatchesBranchCity(h, branchCity || 'Iquique', bias));
}

function finalizeCheckoutHits(hits, parsed, branchCity, bias) {
  return filterCheckoutHits(filterByBranchCity(hits, branchCity, bias), parsed);
}

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

function mapNominatimHit(r, parsed, branchCity = 'Iquique') {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway || a.neighbourhood || r.name || '';
  const osmHouse = a.house_number || null;
  const houseNumber = osmHouse || parsed.houseNumber || null;
  const postcode = parsed.postcode || a.postcode || null;
  const city = branchCity || a.city || a.town || a.village || a.municipality || parsed.city || '';
  const state = a.state || parsed.region || '';
  const shortLabel = formatChileLabel({
    road,
    houseNumber,
    postcode,
    city,
    state,
    neighbourhood: a.neighbourhood,
  });
  const hasExactHouse = houseNumbersMatch(osmHouse, parsed.houseNumber);
  return {
    id: `nom-${r.place_id}`,
    placeId: r.place_id,
    osmType: r.osm_type,
    osmId: r.osm_id,
    label: shortLabel,
    shortLabel,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    precision: hasExactHouse
      ? 'exact'
      : parsed.houseNumber
        ? 'interpolated'
        : osmHouse
          ? 'exact'
          : 'street',
    houseNumber,
    postcode,
    road,
    city,
    state,
    boundingbox: r.boundingbox,
    source: 'nominatim',
  };
}

function mapPhotonHit(f, parsed, branchCity = 'Iquique') {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const road = p.name || p.street || '';
  const osmHouse = p.housenumber || null;
  const houseNumber = osmHouse || parsed.houseNumber || null;
  const postcode = parsed.postcode || p.postcode || null;
  const city = branchCity || p.city || parsed.city || '';
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
  const hasExactHouse = houseNumbersMatch(osmHouse, parsed.houseNumber);
  return {
    id: `pho-${p.osm_type}-${p.osm_id}`,
    osmType: p.osm_type === 'W' ? 'way' : p.osm_type === 'N' ? 'node' : 'relation',
    osmId: p.osm_id,
    label: shortLabel,
    shortLabel,
    lat: Number(lat),
    lng: Number(lng),
    precision: hasExactHouse
      ? 'exact'
      : parsed.houseNumber
        ? 'interpolated'
        : osmHouse
          ? 'exact'
          : 'street',
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

function houseNumbersMatch(a, b) {
  if (!a || !b) return false;
  const na = parseInt(String(a).replace(/\D.*/, ''), 10);
  const nb = parseInt(String(b).replace(/\D.*/, ''), 10);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** Una sola entrada por dirección escrita; prioriza coordenadas exactas. */
function dedupeByLabelPreferExact(hits) {
  const byLabel = new Map();
  for (const h of hits) {
    const key = normText(h.shortLabel);
    const prev = byLabel.get(key);
    if (!prev) {
      byLabel.set(key, h);
      continue;
    }
    const rank = (x) => (x.precision === 'exact' ? 3 : x.precision === 'street' ? 2 : 1);
    if (rank(h) > rank(prev)) byLabel.set(key, h);
  }
  return [...byLabel.values()];
}

/**
 * Checkout: con número de casa solo direcciones exactas (coords reales del inmueble).
 * Las interpoladas usan el centro de calle y cotizan delivery en otra zona.
 */
function filterCheckoutHits(hits, parsed) {
  let list = dedupeHits(hits);
  if (parsed.houseNumber) {
    list = list.filter(
      (h) => h.precision === 'exact'
        && h.houseNumber
        && houseNumbersMatch(h.houseNumber, parsed.houseNumber),
    );
    return dedupeByLabelPreferExact(list);
  }
  return list.filter((h) => h.precision !== 'interpolated');
}

function rankHits(hits, parsed, bias) {
  return [...hits].sort((a, b) => {
    const score = (h) => {
      let s = 0;
      if (h.precision === 'exact') s += 100;
      if (h.precision === 'interpolated') s += 70;
      if (parsed.houseNumber && h.houseNumber === parsed.houseNumber) s += 40;
      if (parsed.street && streetsMatch(h.road, parsed.street)) s += 25;
      const nRoad = normText(h.road);
      const nStreet = normText(parsed.street);
      if (nStreet && nRoad.startsWith(nStreet)) s += 45;
      if (nStreet && nRoad.split(/\s+/).some((w) => w.startsWith(nStreet))) s += 20;
      if (h.source === 'local') s += 12;
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

async function resolveLocalExactHouse(parsed, opts = {}) {
  if (!parsed.houseNumber || !(parsed.street || parsed.rest)) return null;
  const city = opts.city || parsed.city || 'Iquique';
  const targetNum = parseInt(String(parsed.houseNumber).replace(/\D.*/, ''), 10);
  if (!Number.isFinite(targetNum)) return null;

  const matches = matchLocalStreets(parsed.street || parsed.rest, { city, limit: 4 });
  if (!matches.length) return null;

  for (const s of matches) {
    const roadName = preferredLocalRoadName(s.name, city) || s.name;
    const known = await fetchStreetHouseNumbers(roadName, { lat: s.lat, lng: s.lng, road: roadName, city });
    const exactKnown = known.find((k) => k.n === targetNum);
    if (!exactKnown) continue;

    const label = formatChileLabel({
      road: roadName,
      houseNumber: String(parsed.houseNumber),
      postcode: parsed.postcode || exactKnown.postcode || null,
      city,
      state: city === 'Arica' ? 'Arica y Parinacota' : 'Tarapacá',
    });
    return {
      id: `local-exact-${normText(roadName)}-${targetNum}`,
      label,
      shortLabel: label,
      lat: exactKnown.lat,
      lng: exactKnown.lng,
      precision: 'exact',
      houseNumber: String(parsed.houseNumber),
      postcode: parsed.postcode || exactKnown.postcode || null,
      road: roadName,
      city,
      state: city === 'Arica' ? 'Arica y Parinacota' : 'Tarapacá',
      source: 'local',
    };
  }
  return null;
}

function localStreetHits(parsed, opts) {
  // Con número de casa el catálogo local solo tiene el centro de la calle (interpolado).
  if (parsed.houseNumber) return [];
  const city = opts.city || parsed.city || 'Iquique';
  return matchLocalStreets(parsed.street || parsed.rest, {
    city,
    houseNumber: parsed.houseNumber,
    limit: opts.limit || 7,
  }).map((s) => {
    const shortLabel = formatChileLabel({
      road: s.road,
      houseNumber: parsed.houseNumber,
      city: s.city || city,
      state: 'Tarapacá',
    });
    return {
      id: s.id,
      label: shortLabel,
      shortLabel,
      lat: s.lat,
      lng: s.lng,
      precision: parsed.houseNumber ? 'interpolated' : 'street',
      houseNumber: parsed.houseNumber || null,
      postcode: parsed.postcode || null,
      road: s.road,
      city: s.city || city,
      state: 'Tarapacá',
      source: 'local',
    };
  });
}

function cacheKey(query, opts) {
  return `${normText(query)}|${normText(opts.city || '')}|${opts.lat || ''}|${opts.lng || ''}|${opts.limit || 7}|${opts.skipSlow ? 'fast' : 'full'}`;
}

/**
 * Busca direcciones precisas para autocompletado / checkout.
 * @param {string} query
 * @param {{ city?: string, lat?: number, lng?: number, limit?: number, skipSlow?: boolean }} [opts]
 * @returns {Promise<GeocodeHit[]>}
 */
export async function searchPreciseAddresses(query, opts = {}) {
  const parsed = parseAddressQuery(query);
  if ((parsed.street || parsed.rest).length < 2) return [];

  const key = cacheKey(query, opts);
  if (searchCache.has(key)) {
    return finalizeCheckoutHits(searchCache.get(key), parsed, opts.city, {
      lat: opts.lat,
      lng: opts.lng,
    });
  }

  const city = opts.city || parsed.city || 'Iquique';
  const bias = {
    lat: opts.lat != null ? Number(opts.lat) : -20.23,
    lng: opts.lng != null ? Number(opts.lng) : -70.14,
  };
  const limit = opts.limit || 7;

  if (parsed.houseNumber) {
    const localExact = await resolveLocalExactHouse(parsed, { ...opts, city });
    if (localExact) {
      const quick = finalizeCheckoutHits([localExact], parsed, city, bias);
      if (quick.length) {
        if (!opts.skipSlow) searchCache.set(key, quick);
        return quick;
      }
    }
  }

  const local = localStreetHits(parsed, { ...opts, city, limit });

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

  const photonQ = parsed.houseNumber
    ? `${parsed.street} ${parsed.houseNumber}, ${city}, Chile`
    : `${parsed.street}, ${city}, Chile`;

  const hasHouse = !!parsed.houseNumber;
  const tasks = [
    photonSearch(photonQ, { ...bias, limit: limit + 3 }).catch(() => []),
  ];
  if (hasHouse || !opts.skipSlow) {
    tasks.push(
      nominatimSearch({
        q: freeQ,
        limit: String(limit),
        viewbox: viewboxForCity(city),
        bounded: '1',
      }).catch(() => []),
    );
  }
  if (hasHouse) {
    tasks.push(
      nominatimSearch({
        street: streetParam,
        city,
        country: 'Chile',
        postalcode: parsed.postcode || undefined,
        limit: String(limit),
      }).catch(() => []),
    );
  }

  const settled = await Promise.all(tasks);
  const photon = settled[0] || [];
  const nomFree = settled[1] || [];
  const nomStruct = settled[2] || [];

  let hits = [
    ...local,
    ...nomFree.map((r) => mapNominatimHit(r, parsed, city)),
    ...nomStruct.map((r) => mapNominatimHit(r, parsed, city)),
    ...photon.map((f) => mapPhotonHit(f, parsed, city)).filter(Boolean),
  ];

  hits = filterByBranchCity(hits, city, bias);
  hits = dedupeHits(hits);

  const targetNum = parsed.houseNumber
    ? parseInt(String(parsed.houseNumber).replace(/\D.*/, ''), 10)
    : null;

  if (Number.isFinite(targetNum) && hits.length && !opts.skipSlow) {
    const localMatch = matchLocalStreets(parsed.street || parsed.rest, { city, limit: 1 })[0];
    const streetCandidates = hits
      .filter((h) => h.road && streetsMatch(h.road, parsed.street || h.road))
      .sort((a, b) => {
        const da = haversineM({ lat: a.lat, lng: a.lng }, bias);
        const db = haversineM({ lat: b.lat, lng: b.lng }, bias);
        return da - db;
      });
    const near = localMatch
      ? { lat: localMatch.lat, lng: localMatch.lng, road: localMatch.name, city }
      : streetCandidates[0] || hits.find((h) => h.road) || hits[0];
    const roadName = localMatch
      ? (preferredLocalRoadName(localMatch.name, city) || localMatch.name)
      : (preferredLocalRoadName(near.road, city) || near.road || parsed.street);
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
          city,
          state: city === 'Arica' ? 'Arica y Parinacota' : 'Tarapacá',
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
            const next = {
              ...h,
              houseNumber: String(parsed.houseNumber),
              postcode: parsed.postcode || h.postcode,
              shortLabel: nextLabel,
              label: nextLabel,
            };
            if (!sameStreet) return next;
            if (interp.precision === 'exact') {
              return { ...next, lat: interp.lat, lng: interp.lng, precision: 'exact' };
            }
            if (h.precision !== 'exact') {
              return { ...next, lat: interp.lat, lng: interp.lng, precision: interp.precision };
            }
            return next;
          }),
        ];
        hits = dedupeHits(hits);
      }
    } else if (parsed.houseNumber) {
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

  const ranked = finalizeCheckoutHits(rankHits(hits, parsed, bias), parsed, city, bias).slice(0, limit);
  if (ranked.length && !opts.skipSlow) searchCache.set(key, ranked);
  if (searchCache.size > 80) {
    const first = searchCache.keys().next().value;
    searchCache.delete(first);
  }
  return ranked;
}

/** Filtra sugerencias del checkout: solo exactas cuando hay número de casa. */
export function filterAddressSuggestionsForCheckout(hits, query, branchCity, bias = {}) {
  return finalizeCheckoutHits(hits || [], parseAddressQuery(query), branchCity, bias);
}

/**
 * Sugerencias instantáneas (catálogo local) al escribir las primeras letras.
 */
export function previewLocalAddresses(query, opts = {}) {
  const parsed = parseAddressQuery(query);
  if ((parsed.street || parsed.rest).length < 2) return [];
  const local = localStreetHits(parsed, opts);
  return finalizeCheckoutHits(
    rankHits(local, parsed, { lat: opts.lat, lng: opts.lng }),
    parsed,
    opts.city,
    { lat: opts.lat, lng: opts.lng },
  );
}
export async function searchAddressesProgressive(query, opts = {}, onUpdate) {
  const parsed = parseAddressQuery(query);
  if ((parsed.street || parsed.rest).length < 2) {
    onUpdate?.([]);
    return [];
  }
  const bias = { lat: opts.lat, lng: opts.lng };

  if (parsed.houseNumber) {
    const localExact = await resolveLocalExactHouse(parsed, opts);
    if (localExact) {
      const exactList = finalizeCheckoutHits([localExact], parsed, opts.city, bias);
      if (exactList.length) {
        onUpdate?.(exactList);
        return exactList;
      }
    }
  }

  const local = localStreetHits(parsed, opts);
  if (local.length) {
    onUpdate?.(finalizeCheckoutHits(
      rankHits(local, parsed, bias),
      parsed,
      opts.city,
      bias,
    ));
  }

  const fast = await searchPreciseAddresses(query, { ...opts, skipSlow: true });
  onUpdate?.(fast);

  if (parsed.houseNumber) {
    const full = await searchPreciseAddresses(query, { ...opts, skipSlow: false });
    onUpdate?.(full);
    return full;
  }
  return fast;
}

async function fetchJsonTimeout(url, opts = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { ...FETCH_HEADERS, ...(opts.headers || {}) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOverpass(query, timeoutMs = 6500) {
  const body = new URLSearchParams({ data: query });
  const tryUrl = async (url) => {
    const data = await fetchJsonTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      },
      timeoutMs,
    );
    if (!data?.elements) throw new Error('overpass');
    return data;
  };
  try {
    return await Promise.any(OVERPASS_ENDPOINTS.map((url) => tryUrl(url)));
  } catch {
    return null;
  }
}

function guessCityFromCoords(lat, lng) {
  if (lat > -18.62 && lat < -18.4 && lng > -70.4 && lng < -70.24) return 'Arica';
  if (lng > -70.115) return 'Alto Hospicio';
  return 'Iquique';
}

function betterPostcode(a, b) {
  const score = (p) => {
    if (!p) return 0;
    if (/0{4}$/.test(String(p))) return 1;
    return 2;
  };
  return score(a) >= score(b) ? a || b : b || a;
}

function buildGpsHit({ lat, lng, road, houseNumber, postcode, city, state, precision, source = 'gps', buildingLat, buildingLng }) {
  const cityName = city || guessCityFromCoords(lat, lng);
  const roadName = preferredLocalRoadName(road, cityName) || road || '';
  const shortLabel = formatChileLabel({
    road: roadName || 'Ubicación',
    houseNumber: houseNumber || null,
    postcode: postcode || null,
    city: cityName,
    state: state || 'Tarapacá',
  });
  return {
    id: `rev-${source}-${lat}-${lng}-${houseNumber || 's'}`,
    label: shortLabel,
    shortLabel,
    lat,
    lng,
    precision: houseNumber ? precision || 'exact' : 'street',
    houseNumber: houseNumber ? String(houseNumber) : null,
    postcode: postcode || null,
    road: roadName,
    city: cityName,
    state: state || 'Tarapacá',
    source: 'gps',
    via: source,
    buildingLat: Number.isFinite(buildingLat) ? buildingLat : null,
    buildingLng: Number.isFinite(buildingLng) ? buildingLng : null,
  };
}

function projectFactor(p, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-14) return 0;
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

function estimateHouseFromNearby(lat, lng, houses) {
  if (!houses?.length) return null;
  const withDist = houses
    .map((h) => ({
      ...h,
      d: haversineM({ lat, lng }, { lat: h.lat, lng: h.lng }),
    }))
    .sort((a, b) => a.d - b.d);
  const closest = withDist[0];
  if (!closest) return null;
  if (closest.d <= 18) {
    return {
      n: closest.n,
      street: closest.street,
      postcode: closest.postcode,
      precision: 'exact',
      lat: closest.lat,
      lng: closest.lng,
      distM: closest.d,
    };
  }

  const parity = closest.n % 2;
  const sameStreet = withDist.filter((h) => streetsMatch(h.street, closest.street));
  const sameSide = sameStreet.filter((h) => h.n % 2 === parity);
  const pool = sameSide.length >= 2 ? sameSide : sameStreet;

  if (pool.length >= 2) {
    const a = pool[0];
    const b = pool[1];
    const t = projectFactor({ lat, lng }, a, b);
    let n = Math.round(a.n + (b.n - a.n) * t);
    if (n % 2 !== parity) n += 1;
    if (!Number.isFinite(n) || n < 1) n = closest.n;
    return {
      n,
      street: closest.street,
      postcode: closest.postcode || a.postcode,
      precision: 'interpolated',
      lat,
      lng,
      distM: closest.d,
    };
  }

  return {
    n: closest.n,
    street: closest.street,
    postcode: closest.postcode,
    precision: closest.d < 28 ? 'exact' : 'interpolated',
    lat: closest.lat,
    lng: closest.lng,
    distM: closest.d,
  };
}

function parseOverpassHouses(data) {
  return (data?.elements || [])
    .map((el) => {
      const raw = String(el.tags?.['addr:housenumber'] || '').trim();
      const n = parseInt(raw.replace(/\D.*/, ''), 10);
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!Number.isFinite(n) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        n,
        lat: Number(lat),
        lng: Number(lng),
        street: el.tags?.['addr:street'] || '',
        postcode: el.tags?.['addr:postcode'] || null,
        city: el.tags?.['addr:city'] || null,
      };
    })
    .filter(Boolean);
}

async function reverseOverpassNearby(lat, lng, radiusM = 55) {
  const around = Math.max(25, Math.min(80, Math.round(radiusM)));
  const q = `
[out:json][timeout:6];
(
  node["addr:housenumber"](around:${around},${lat},${lng});
  way["addr:housenumber"](around:${around},${lat},${lng});
);
out center 40;
`.trim();
  const data = await fetchOverpass(q, 6500);
  const houses = parseOverpassHouses(data);
  const est = estimateHouseFromNearby(lat, lng, houses);
  if (!est) return { hit: null, houses };
  const city = houses.find((h) => h.city)?.city || guessCityFromCoords(lat, lng);
  const hit = buildGpsHit({
    lat,
    lng,
    road: est.street,
    houseNumber: String(est.n),
    postcode: est.postcode,
    city,
    state: city === 'Arica' ? 'Arica y Parinacota' : 'Tarapacá',
    precision: est.precision,
    source: 'overpass',
    buildingLat: est.lat,
    buildingLng: est.lng,
  });
  return { hit, houses };
}

function mapReverseNominatim(data, lat, lng) {
  if (!data?.address) return null;
  const a = data.address;
  const road = a.road || a.pedestrian || a.footway || a.neighbourhood || '';
  const houseNumber = a.house_number || null;
  const city = a.city || a.town || a.village || a.municipality || guessCityFromCoords(lat, lng);
  if (!road && !houseNumber) return null;
  return buildGpsHit({
    lat,
    lng,
    road: road || a.suburb || '',
    houseNumber,
    postcode: a.postcode || null,
    city,
    state: a.state || '',
    source: 'nominatim',
  });
}

function mapReversePhoton(data, lat, lng) {
  const f = data?.features?.[0];
  if (!f) return null;
  const p = f.properties || {};
  const road = p.street || p.name || '';
  const houseNumber = p.housenumber || null;
  if (!road && !houseNumber) return null;
  return buildGpsHit({
    lat,
    lng,
    road,
    houseNumber,
    postcode: p.postcode || null,
    city: p.city || guessCityFromCoords(lat, lng),
    state: p.state || '',
    source: 'photon',
  });
}

function parseHouseFromAddressLine(address) {
  const m = String(address || '').trim().match(/(\d+[A-Za-z]?)\s*$/);
  return m ? m[1] : null;
}

function mapArcGisReverse(data, lat, lng) {
  const a = data?.address;
  if (!a) return null;
  const country = String(a.CountryCode || a.CntryName || '').toUpperCase();
  if (country && country !== 'CHL' && !/chile/i.test(a.CntryName || '')) return null;

  let houseNumber = String(a.AddNum || '').trim();
  if (houseNumber.includes('-')) houseNumber = parseHouseFromAddressLine(a.Address) || houseNumber.split('-')[0];
  if (!houseNumber) houseNumber = parseHouseFromAddressLine(a.Address) || '';

  let road = String(a.StName || '').trim();
  if (!road && a.Address) {
    road = String(a.Address)
      .replace(/,.*$/, '')
      .replace(/\s+\d+[A-Za-z]?(?:\s*-\s*\d+)?\s*$/, '')
      .trim();
  }
  road = road.replace(/^(calle|av\.?|avenida|pasaje|psje\.?)\s+/i, '').trim();
  if (!road && !houseNumber) return null;

  const precision = a.Addr_type === 'PointAddress'
    ? 'exact'
    : houseNumber
      ? 'interpolated'
      : 'street';

  return buildGpsHit({
    lat,
    lng,
    road,
    houseNumber: houseNumber || null,
    postcode: a.Postal || null,
    city: a.City || guessCityFromCoords(lat, lng),
    state: a.Region || 'Tarapacá',
    precision,
    source: 'arcgis',
    buildingLat: Number(data.location?.y ?? a.Y),
    buildingLng: Number(data.location?.x ?? a.X),
  });
}

async function reverseArcGis(lat, lng, distanceM = 32) {
  const url = new URL(ARCGIS_REVERSE);
  url.searchParams.set('f', 'json');
  url.searchParams.set('location', `${lng},${lat}`);
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('langCode', 'es');
  url.searchParams.set('distance', String(Math.max(16, Math.min(40, Math.round(distanceM)))));
  url.searchParams.set('featureTypes', 'PointAddress,StreetAddress');
  const data = await fetchJsonTimeout(
    url.toString(),
    { headers: { Accept: 'application/json', 'Accept-Language': 'es' } },
    2800,
  );
  return mapArcGisReverse(data, lat, lng);
}

async function reverseNominatim(lat, lng) {
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('countrycodes', 'cl');
  const data = await fetchJsonTimeout(url.toString(), {}, 4000);
  return mapReverseNominatim(data, lat, lng);
}

async function reversePhoton(lat, lng) {
  const url = new URL(PHOTON_REVERSE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('lang', 'en');
  const data = await fetchJsonTimeout(url.toString(), {}, 4000);
  return mapReversePhoton(data, lat, lng);
}

function mergeReverseHits(hits, lat, lng) {
  const list = hits.filter(Boolean);
  if (!list.length) return null;
  const rank = (h) => {
    let s = 0;
    if (h.houseNumber) s += 20;
    if (h.via === 'arcgis') s += 18;
    if (h.via === 'overpass') s += 12;
    if (h.via === 'nominatim') s += 14;
    if (h.precision === 'exact') s += 8;
    if (h.road) s += 3;
    return s;
  };
  const withHouse = list.filter((h) => h.houseNumber).sort((a, b) => rank(b) - rank(a));
  const preferred = withHouse[0] || list[0];
  const houseNumber = preferred.houseNumber || list.find((h) => h.houseNumber)?.houseNumber || null;
  const postcode = list.reduce((acc, h) => betterPostcode(acc, h.postcode), null);
  const city = preferred.city || list.find((h) => h.city)?.city || guessCityFromCoords(lat, lng);
  const state = preferred.state || list.find((h) => h.state)?.state || '';

  const roads = list.filter((h) => h.road).map((h) => h.road);
  const road = roads.sort((a, b) => b.length - a.length)[0] || '';

  return buildGpsHit({
    lat,
    lng,
    road,
    houseNumber,
    postcode,
    city,
    state,
    precision: preferred.precision || (houseNumber ? 'exact' : 'street'),
  });
}

function firstUsefulReverse(promises, lat, lng) {
  return new Promise((resolve) => {
    let pending = promises.length;
    let settled = false;
    const gathered = [];
    if (!pending) {
      resolve(null);
      return;
    }
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(mergeReverseHits(gathered, lat, lng));
    };
    promises.forEach((p) => {
      Promise.resolve(p)
        .then((hit) => {
          if (hit) gathered.push(hit);
          if (hit?.houseNumber && hit?.road && !settled) {
            const specificCp = hit.postcode && !/0{4}$/.test(String(hit.postcode));
            const done = () => {
              if (settled) return;
              settled = true;
              resolve(mergeReverseHits(gathered, lat, lng));
            };
            if (specificCp && gathered.length >= 2) done();
            else setTimeout(done, 280);
            return;
          }
          pending -= 1;
          if (pending === 0) finish();
        })
        .catch(() => {
          pending -= 1;
          if (pending === 0) finish();
        });
    });
  });
}

function pickClosestHit(hits, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const h of hits.filter(Boolean)) {
    const bLat = Number(h.buildingLat);
    const bLng = Number(h.buildingLng);
    if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
    const d = haversineM({ lat, lng }, { lat: bLat, lng: bLng });
    if (d < bestD) {
      bestD = d;
      best = { ...h, distM: d };
    }
  }
  return best;
}

function housesToHits(houses, lat, lng) {
  const city = houses.find((h) => h.city)?.city || guessCityFromCoords(lat, lng);
  return houses.map((h) => buildGpsHit({
    lat,
    lng,
    road: h.street,
    houseNumber: String(h.n),
    postcode: h.postcode,
    city,
    state: city === 'Arica' ? 'Arica y Parinacota' : 'Tarapacá',
    precision: 'exact',
    source: 'overpass',
    buildingLat: h.lat,
    buildingLng: h.lng,
  }));
}

/**
 * Dirección exacta (calle + número) a partir del GPS real del teléfono.
 */
function applyLocalRoadName(hit, city) {
  if (!hit?.road) return hit;
  const corrected = preferredLocalRoadName(hit.road, city) || hit.road;
  if (corrected === hit.road) return hit;
  const label = formatChileLabel({
    road: corrected,
    houseNumber: hit.houseNumber,
    postcode: hit.postcode,
    city: hit.city || city,
    state: hit.state || 'Tarapacá',
  });
  return { ...hit, road: corrected, label, shortLabel: label };
}

export async function reverseGeocodePrecise(lat, lng, opts = {}) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;

  const accuracy = Number(opts.accuracy);
  const overpassRadius = Number.isFinite(accuracy)
    ? Math.max(20, Math.min(80, Math.round(accuracy * 1.5)))
    : 45;
  const arcRadius = Number.isFinite(accuracy)
    ? Math.max(18, Math.min(50, accuracy * 1.35))
    : 35;

  const key = `rev:${la.toFixed(6)},${ln.toFixed(6)},${Math.round(arcRadius)}`;
  if (searchCache.has(key)) return searchCache.get(key);

  // Lanzar todas las fuentes en paralelo
  const [ovResult, arc, pho, nom] = await Promise.all([
    reverseOverpassNearby(la, ln, overpassRadius).catch(() => ({ hit: null, houses: [] })),
    reverseArcGis(la, ln, arcRadius).catch(() => null),
    reversePhoton(la, ln).catch(() => null),
    reverseNominatim(la, ln).catch(() => null),
  ]);

  const city = guessCityFromCoords(la, ln);

  // Overpass es la fuente más fiable para OSM Chile — tiene prioridad si tiene número
  if (ovResult?.hit?.houseNumber) {
    const corrected = applyLocalRoadName(ovResult.hit, city);
    const result = { ...corrected, lat: la, lng: ln, source: 'gps' };
    searchCache.set(key, result);
    if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
    return result;
  }

  const best = mergeReverseHits([arc, pho, nom], la, ln);

  const finalHit = best
    ? applyLocalRoadName({ ...best, lat: la, lng: ln, source: 'gps', city: best.city || city }, city)
    : {
        id: `rev-raw-${la}-${ln}`,
        label: `Ubicación GPS (${la.toFixed(5)}, ${ln.toFixed(5)})`,
        shortLabel: `Ubicación GPS (${la.toFixed(5)}, ${ln.toFixed(5)})`,
        lat: la,
        lng: ln,
        precision: 'street',
        houseNumber: null,
        postcode: null,
        road: '',
        city,
        state: '',
        source: 'gps',
      };

  if (finalHit.houseNumber) searchCache.set(key, finalHit);
  if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
  return finalHit;
}

export function precisionHint(precision) {
  if (precision === 'exact') return 'Ubicación exacta del número';
  if (precision === 'interpolated') return 'Ubicación estimada por número de casa';
  return 'Calle confirmada — indica el número para más precisión';
}
