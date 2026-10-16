import { parseBoundedDecimal, type FieldParse } from '../../core/parse';

export const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export const BITS_PER_CHAR = 5;
export const MIN_PRECISION = 1;
export const MAX_PRECISION = 9;
/** About how long one degree is at the equator, for both axes (an approximation, stated on screen). */
export const KM_PER_DEGREE = 111.32;

export const LAT_RANGE = { min: -90, max: 90 } as const;
export const LON_RANGE = { min: -180, max: 180 } as const;

export interface BitStep {
  axis: 'lon' | 'lat';
  lo: number;
  hi: number;
  mid: number;
  bit: 0 | 1;
}

export interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/** The bisection steps for the first `precision * 5` bits: longitude first, then latitude, alternating. */
export function bitSteps(lat: number, lon: number, precision: number): BitStep[] {
  const range: Record<'lon' | 'lat', [number, number]> = { lon: [LON_RANGE.min, LON_RANGE.max], lat: [LAT_RANGE.min, LAT_RANGE.max] };
  const steps: BitStep[] = [];
  for (let i = 0; i < precision * BITS_PER_CHAR; i++) {
    const axis = i % 2 === 0 ? 'lon' : 'lat';
    const [lo, hi] = range[axis];
    const mid = (lo + hi) / 2;
    const value = axis === 'lon' ? lon : lat;
    const bit = value >= mid ? 1 : 0;
    steps.push({ axis, lo, hi, mid, bit });
    range[axis] = bit ? [mid, hi] : [lo, mid];
  }
  return steps;
}

export function encode(lat: number, lon: number, precision: number): string {
  const steps = bitSteps(lat, lon, precision);
  let out = '';
  for (let c = 0; c < precision; c++) {
    let v = 0;
    for (let b = 0; b < BITS_PER_CHAR; b++) v = v * 2 + steps[c * BITS_PER_CHAR + b].bit;
    out += BASE32[v];
  }
  return out;
}

/** The cell a code names. */
export function decodeBounds(hash: string): Bounds {
  let lon: [number, number] = [LON_RANGE.min, LON_RANGE.max];
  let lat: [number, number] = [LAT_RANGE.min, LAT_RANGE.max];
  let isLon = true;
  for (const ch of hash) {
    const v = BASE32.indexOf(ch);
    for (let b = BITS_PER_CHAR - 1; b >= 0; b--) {
      const range = isLon ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((v >> b) & 1) range[0] = mid;
      else range[1] = mid;
      isLon = !isLon;
    }
  }
  return { latMin: lat[0], latMax: lat[1], lonMin: lon[0], lonMax: lon[1] };
}

export const decodeCentre = (hash: string): { lat: number; lon: number } => {
  const b = decodeBounds(hash);
  return { lat: (b.latMin + b.latMax) / 2, lon: (b.lonMin + b.lonMax) / 2 };
};

export const inBounds = (b: Bounds, lat: number, lon: number) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;

/** Bits spent on each axis at a precision: longitude gets the extra bit when the count is odd. */
export const axisBits = (precision: number) => ({
  lon: Math.ceil((precision * BITS_PER_CHAR) / 2),
  lat: Math.floor((precision * BITS_PER_CHAR) / 2),
});

export interface CellSize {
  widthDeg: number;
  heightDeg: number;
  /** At the equator, with one degree taken as KM_PER_DEGREE. */
  widthKm: number;
  heightKm: number;
}

export function cellSize(precision: number): CellSize {
  const bits = axisBits(precision);
  const widthDeg = 360 / 2 ** bits.lon;
  const heightDeg = 180 / 2 ** bits.lat;
  return { widthDeg, heightDeg, widthKm: widthDeg * KM_PER_DEGREE, heightKm: heightDeg * KM_PER_DEGREE };
}

/** A cell's width in km at a latitude: the equator figure scaled by cos(latitude). */
export const widthKmAt = (precision: number, lat: number): number => cellSize(precision).widthKm * Math.cos((lat * Math.PI) / 180);

/** The cells touching this one (up to 8; fewer at the poles), found by stepping one cell in each direction and re-encoding. */
export function neighbours(hash: string): string[] {
  const b = decodeBounds(hash);
  const h = b.latMax - b.latMin;
  const w = b.lonMax - b.lonMin;
  const centre = decodeCentre(hash);
  const out = new Set<string>();
  for (const dLat of [-1, 0, 1]) {
    for (const dLon of [-1, 0, 1]) {
      if (dLat === 0 && dLon === 0) continue;
      const lat = centre.lat + dLat * h;
      if (lat < LAT_RANGE.min || lat > LAT_RANGE.max) continue;
      let lon = centre.lon + dLon * w;
      if (lon < LON_RANGE.min) lon += 360;
      if (lon >= LON_RANGE.max) lon -= 360;
      out.add(encode(lat, lon, hash.length));
    }
  }
  out.delete(hash);
  return [...out];
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Points a "near me" query would return: those whose code starts with one of the searched cells' codes.
 * With `withNeighbours` the query cell's neighbours are searched too.
 */
export function searchCells(points: readonly GeoPoint[], query: GeoPoint, precision: number, withNeighbours: boolean): GeoPoint[] {
  const own = encode(query.lat, query.lon, precision);
  const cells = new Set(withNeighbours ? [own, ...neighbours(own)] : [own]);
  return points.filter((p) => cells.has(encode(p.lat, p.lon, precision)));
}

/** "Near" in this lesson: within one cell's shorter side, in degrees on both axes at once (a box, stated on screen). */
export const nearRadiusDeg = (precision: number): number => {
  const s = cellSize(precision);
  return Math.min(s.widthDeg, s.heightDeg);
};

export const isNear = (a: GeoPoint, b: GeoPoint, radius: number) => Math.abs(a.lat - b.lat) <= radius && Math.abs(a.lon - b.lon) <= radius;

const messages = (what: string, lo: number, hi: number) => ({
  empty: `Type a ${what} between ${lo} and ${hi}.`,
  invalid: (typed: string) => `"${typed}" isn't a ${what}. Use a plain decimal like 57.64911.`,
  tooSmall: () => `A ${what} below ${lo} does not exist: it is refused, not wrapped around.`,
  tooBig: () => `A ${what} above ${hi} does not exist: it is refused, not wrapped around.`,
});

/** The cell after only the first `bits` bits: the box on the map while the learner scrubs the bisection. */
export function boundsAfterBits(lat: number, lon: number, bits: number): Bounds {
  const b: Bounds = { latMin: LAT_RANGE.min, latMax: LAT_RANGE.max, lonMin: LON_RANGE.min, lonMax: LON_RANGE.max };
  for (const s of bitSteps(lat, lon, Math.ceil(bits / BITS_PER_CHAR)).slice(0, bits)) {
    if (s.axis === 'lon') {
      if (s.bit) b.lonMin = s.mid;
      else b.lonMax = s.mid;
    } else if (s.bit) b.latMin = s.mid;
    else b.latMax = s.mid;
  }
  return b;
}

/** Leading characters two codes share. */
export const sharedPrefix = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** "4.89 km" or "38.2 m": a length in km written in the unit that keeps it readable. */
export const formatLength = (km: number): string => (km >= 1 ? `${Number(km.toPrecision(3))} km` : `${Number((km * 1000).toPrecision(3))} m`);

export const parseLatitude =(text: string): FieldParse<number> =>
  parseBoundedDecimal(text, { min: LAT_RANGE.min, max: LAT_RANGE.max, typographicMinus: true, messages: messages('latitude', LAT_RANGE.min, LAT_RANGE.max) });
export const parseLongitude = (text: string): FieldParse<number> =>
  parseBoundedDecimal(text, { min: LON_RANGE.min, max: LON_RANGE.max, typographicMinus: true, messages: messages('longitude', LON_RANGE.min, LON_RANGE.max) });
