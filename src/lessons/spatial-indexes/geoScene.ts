import { mulberry32 } from '../../core/random';
import {
  LAT_RANGE, LON_RANGE, cellSize, decodeBounds, encode, isNear, nearRadiusDeg, neighbours, searchCells, sharedPrefix, type Bounds, type GeoPoint,
} from './geohash';

export const GEO_SEED = 3;
export const GEO_OTHERS = 24;
/** The scattered points reach this many cells out from the query on each axis. */
const SPREAD_CELLS = 1.5;
/** The second point of the equator and prime meridian pair, a few metres from the first. */
export const BOUNDARY_A: GeoPoint = { lat: 0.0001, lon: 0.0001 };
export const BOUNDARY_B: GeoPoint = { lat: -0.0001, lon: -0.0001 };
export const BOUNDARY_PRECISION = 6;

/** found: near and returned; missed: near but not returned; extra: returned but not near; far: neither. */
export type OtherState = 'found' | 'missed' | 'extra' | 'far';

export interface Other {
  point: GeoPoint;
  state: OtherState;
  code: string;
}

export interface GeoView {
  code: string;
  cell: Bounds;
  neighbourCells: { code: string; bounds: Bounds }[];
  others: Other[];
  /** The other point nearest the query by box distance, and how many leading characters its code shares with the query's. */
  nearest: { code: string; shared: number } | null;
  radiusDeg: number;
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The toy "other points": a seeded scatter around the query, plus the pair partner for the boundary preset. */
export function scatterAround(query: GeoPoint, precision: number, boundary: boolean): GeoPoint[] {
  const rnd = mulberry32(GEO_SEED);
  const s = cellSize(precision);
  const scatter = Array.from({ length: GEO_OTHERS }, () => ({
    lat: clampTo(query.lat + (rnd() * 2 - 1) * SPREAD_CELLS * s.heightDeg, LAT_RANGE.min, LAT_RANGE.max),
    lon: clampTo(query.lon + (rnd() * 2 - 1) * SPREAD_CELLS * s.widthDeg, LON_RANGE.min, LON_RANGE.max),
  }));
  return boundary ? [BOUNDARY_B, ...scatter] : scatter;
}

/** Everything the geohash scene draws and says, from its four inputs. */
export function geoView(query: GeoPoint, precision: number, withNeighbours: boolean, boundary: boolean): GeoView {
  const code = encode(query.lat, query.lon, precision);
  const radiusDeg = nearRadiusDeg(precision);
  const pts = scatterAround(query, precision, boundary);
  const searched = new Set(searchCells(pts, query, precision, withNeighbours));
  const stateOf = (point: GeoPoint): OtherState => {
    const near = isNear(point, query, radiusDeg);
    if (searched.has(point)) return near ? 'found' : 'extra';
    return near ? 'missed' : 'far';
  };
  const others: Other[] = pts.map((point) => ({ point, code: encode(point.lat, point.lon, precision), state: stateOf(point) }));
  const nearest = others.length
    ? others.reduce((best, o) => (Math.max(Math.abs(o.point.lat - query.lat), Math.abs(o.point.lon - query.lon)) < Math.max(Math.abs(best.point.lat - query.lat), Math.abs(best.point.lon - query.lon)) ? o : best))
    : null;
  return {
    code,
    cell: decodeBounds(code),
    neighbourCells: neighbours(code).map((c) => ({ code: c, bounds: decodeBounds(c) })),
    others,
    nearest: nearest ? { code: nearest.code, shared: sharedPrefix(code, nearest.code) } : null,
    radiusDeg,
  };
}
