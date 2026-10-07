/**
 * Map a numeric domain onto a pixel range, linearly or on a log axis.
 * Used by floating-point (neighbours on a log number line), logs-exponentials
 * (linear vs log chart) and memory-hierarchy (the latency ladder).
 */
export interface Scale {
  /** Domain value → range position. Log scales return NaN for v <= 0. */
  map(v: number): number;
  /** Range position → domain value. */
  invert(px: number): number;
  /** Tick values inside the domain, at most about `count` of them. */
  ticks(count?: number): number[];
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

const DEFAULT_TICKS = 5;

/** A "nice" step (1, 2 or 5 × a power of ten) that splits `span` into about `count` parts. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude; // in [1, 10)
  const factor = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return factor * magnitude;
}

/** Round away float noise such as 0.30000000000000004 relative to the step size. */
function tidy(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(decimals, 20)));
}

function checkDomain(d0: number, d1: number) {
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) {
    throw new RangeError(`scale domain must be two different finite numbers, got [${d0}, ${d1}]`);
  }
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  checkDomain(d0, d1);
  const k = (r1 - r0) / (d1 - d0);
  return {
    domain: [d0, d1],
    range: [r0, r1],
    map: (v) => r0 + (v - d0) * k,
    invert: (px) => d0 + (px - r0) / k,
    ticks(count = DEFAULT_TICKS) {
      const lo = Math.min(d0, d1);
      const hi = Math.max(d0, d1);
      const step = niceStep(hi - lo, count);
      const out: number[] = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(tidy(v, step));
      return out;
    },
  };
}

/**
 * Log-axis scale. The domain must be positive. Ticks are whole powers of `base`
 * inside the domain, thinned evenly when there are more than `count`.
 */
export function logScale(d0: number, d1: number, r0: number, r1: number, base = 10): Scale {
  checkDomain(d0, d1);
  if (d0 <= 0 || d1 <= 0) throw new RangeError(`log scale domain must be positive, got [${d0}, ${d1}]`);
  if (base <= 1) throw new RangeError(`log scale base must be > 1, got ${base}`);
  const log = (v: number) => Math.log(v) / Math.log(base);
  const l0 = log(d0);
  const k = (r1 - r0) / (log(d1) - l0);
  return {
    domain: [d0, d1],
    range: [r0, r1],
    map: (v) => (v > 0 ? r0 + (log(v) - l0) * k : NaN),
    invert: (px) => base ** (l0 + (px - r0) / k),
    ticks(count = DEFAULT_TICKS) {
      const lo = Math.min(d0, d1);
      const hi = Math.max(d0, d1);
      const first = Math.ceil(log(lo) - 1e-9);
      const last = Math.floor(log(hi) + 1e-9);
      const exponents: number[] = [];
      for (let e = first; e <= last; e++) exponents.push(e);
      const stride = Math.max(1, Math.ceil(exponents.length / Math.max(1, count)));
      return exponents.filter((_, i) => i % stride === 0).map((e) => base ** e);
    },
  };
}

/** Smallest scene text a phone may render, in px: `npm run smoke -- --mobile` fails below it. */
export const MIN_TEXT_PX = 8;

/**
 * The `minWidth` for a StageFrame or WideRegion holding a drawing `naturalWidth` wide whose
 * smallest text is `smallestTextPx` at natural size: the narrowest width before that text
 * shrinks under MIN_TEXT_PX, ⌈width × 8 / smallest⌉. `floor` keeps it at least that wide
 * (a small drawing still taking a phone's width).
 *
 *   <WideRegion minWidth={minWidthForText(W, 13)}>        // 13px edge weights
 */
export const minWidthForText = (naturalWidth: number, smallestTextPx: number, floor = 0) =>
  Math.max(floor, Math.ceil((naturalWidth * MIN_TEXT_PX) / smallestTextPx));
