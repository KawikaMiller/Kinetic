// Shared number and text formatting. Lesson-specific formats (money, burn rates,
// op counts) stay in their lesson.

/** The one "no value yet" placeholder. */
export const NA = '–';

/** Seconds as '1.2s' at one second and above, '340ms' below. */
export function duration(seconds: number): string {
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds * 1000)}ms`;
}

/** Whole numbers from 10 up, one decimal below, dropping a trailing '.0': 42, 4.8, 3. */
const shortNumber = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));

/** A very short time in nanoseconds, in the right unit: '0.3 ns', '50 µs', '5 ms', '2 s'. */
export function latency(ns: number): string {
  if (ns < 1e3) return `${shortNumber(ns)} ns`;
  if (ns < 1e6) return `${shortNumber(ns / 1e3)} µs`;
  if (ns < 1e9) return `${shortNumber(ns / 1e6)} ms`;
  return `${shortNumber(ns / 1e9)} s`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const HUMAN_UNITS: [limit: number, size: number, one: string, many: string][] = [
  [MINUTE, 1, 's', 's'],
  [HOUR, MINUTE, 'min', 'min'],
  [DAY, HOUR, 'hour', 'hours'],
  [YEAR, DAY, 'day', 'days'],
  [Infinity, YEAR, 'year', 'years'],
];

/** No-break space: '5.4 × 10²⁹²' never wraps inside the number. */
const NBSP = '\u00a0';

/** From this many years up, humanDuration writes the years as a power of ten. */
const SCIENTIFIC_YEARS = 1e6;

/** A huge number as 'm × 10ᵏ' with one decimal at most: 3.2e292 → '3.2 × 10²⁹²', 1e6 → '1 × 10⁶'. */
function scientific(v: number): string {
  let k = Math.floor(Math.log10(v));
  let m = Number((v / 10 ** k).toFixed(1));
  if (m >= 10) {
    m /= 10;
    k += 1;
  }
  return `${String(m)}${NBSP}×${NBSP}${power(k, 10)}`;
}

/** Below this, humanDuration says 'under a microsecond' instead of rounding to '0 s'. */
const MICROSECOND = 1e-6;

/**
 * A long span of seconds in the biggest sensible unit: '1 s', '1.7 min', '14 hours', '1 day',
 * '4.8 years', and past a million years a power of ten: '3.2 × 10²⁹² years'. A positive span
 * under a microsecond is 'under a microsecond'; exactly 0 stays '0 s'.
 */
export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞ years';
  if (seconds > 0 && seconds < MICROSECOND) return 'under a microsecond';
  if (seconds / YEAR >= SCIENTIFIC_YEARS) return `${scientific(seconds / YEAR)} years`;
  const [, size, one, many] = HUMAN_UNITS.find(([limit]) => seconds < limit)!;
  const text = shortNumber(seconds / size);
  return `${text} ${text === '1' ? one : many}`;
}

const MICROSECOND_LOG10 = -6;
/** Below this many log₁₀ seconds the value fits a Number comfortably, so humanDuration words it. */
const PLAIN_LOG10_LIMIT = 15;
const YEAR_LOG10 = Math.log10(YEAR);

/**
 * A duration given as log₁₀ seconds, for spans past what a double holds (a 617-digit search is
 * 10⁶⁰⁸ s): humanDuration while it fits, then 'about 10ⁿ years'.
 */
export function humanDurationLog10(log10Seconds: number): string {
  if (log10Seconds < MICROSECOND_LOG10) return 'under a microsecond';
  if (log10Seconds < PLAIN_LOG10_LIMIT) return humanDuration(10 ** log10Seconds);
  return `about ${power(Math.round(log10Seconds - YEAR_LOG10), 10)} years`;
}

/** A readout number: rounded to dp places, trailing zeros dropped, a real minus sign (−0.25); -0 prints as 0. */
export function decimal(v: number, dp: number): string {
  const r = Number(v.toFixed(dp));
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** Milliseconds, rounded: '42 ms'. */
export const ms = (v: number) => `${Math.round(v)} ms`;

/** A rate: '12/s'. */
export const perSec = (v: number, dp = 0) => `${v.toFixed(dp)}/s`;

/** A ratio as a percentage: 0.123 → '12%'. With dp ≥ 1, tiny non-zero values show as '<0.1%'. */
export function pct(ratio: number, dp = 0): string {
  const v = ratio * 100;
  const floor = 10 ** -dp;
  if (dp > 0 && v > 0 && v < floor) return `<${floor}%`;
  return `${v.toFixed(dp)}%`;
}

/**
 * Byte counts: '512 B', '1.5 KB', '8.0 MB', '2.1 GB'. Binary (1 KB = 1,024 B) by default;
 * `base: 1000` for decimal units, `dp` for decimals shown above bytes. `iec: true` names the binary
 * units properly ('4.0 KiB', '8 MiB') for lessons that distinguish them; it has no effect with `base: 1000`.
 */
export function bytes(n: number, o: { base?: 1000 | 1024; dp?: number; iec?: boolean } = {}): string {
  const { base = 1024, dp = 1, iec = false } = o;
  if (n < base) return `${Math.round(n)} B`;
  const units = iec && base === 1024 ? ['KiB', 'MiB', 'GiB', 'TiB'] : ['KB', 'MB', 'GB', 'TB'];
  let v = n / base;
  let u = 0;
  while (v >= base && u < units.length - 1) {
    v /= base;
    u++;
  }
  return `${v.toFixed(dp)} ${units[u]}`;
}

/** A multiplier: '3×'. */
export const times = (v: number | string) => `${v}×`;

/** '1 step', '3 steps', or a custom plural: plural(2, 'entry', 'entries'). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Narrow no-break space: there is no superscript comma, so long exponents group like "10³⁰¹ ⁰²⁹". */
const EXP_GROUP = ' ';

interface SuperscriptOptions {
  /** Group the digits in threes (for huge exponents): 301029972 → '³⁰¹ ⁰²⁹ ⁹⁷²'. */
  grouped?: boolean;
}

/** An integer in Unicode superscript digits, for exponents in plain text: 23 → '²³', -4 → '⁻⁴'. */
export function superscript(n: number, { grouped = false }: SuperscriptOptions = {}): string {
  const k = Math.trunc(n);
  const digits = [...String(Math.abs(k))].map((ch) => SUPERSCRIPT_DIGITS[Number(ch)]).join('');
  const groups: string[] = [];
  if (grouped) for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return `${k < 0 ? '⁻' : ''}${grouped ? groups.join(EXP_GROUP) : digits}`;
}

/** A power as plain text: power(10) → '2¹⁰', power(-4, 10) → '10⁻⁴'. */
export const power = (k: number, base = 2, options?: SuperscriptOptions) => `${base}${superscript(k, options)}`;

/** Two-digit zero padding: 7 → '07'. */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** `x` to `digits` significant figures with thousands separators: 1234.5 → "1,230", 0.012345 → "0.0123". NaN is "–", infinities "∞" / "−∞". */
export function sig(x: number, digits = 3): string {
  if (Number.isNaN(x)) return NA;
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const rounded = Number(x.toPrecision(digits));
  const text = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 20 });
  return rounded < 0 ? `−${text}` : text;
}

/** A share 0..1 as a percentage with `dp` decimals: 0.691 → "69.1%"; NaN is "–". (`pct` is the other flavour: no NaN guard, 0 decimals.) */
export function pctText(share: number, dp = 1): string {
  if (Number.isNaN(share)) return NA;
  return `${(share * 100).toFixed(dp)}%`;
}

/** A count with thousands separators and no rounding of a whole number: 23414 → "23,414". Use `sig` when 3 significant figures will do. */
export const integer = (n: number): string => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : NA);

/** A ratio to two decimals: 0.9987 → "1.00", so a ratio near 1 never reads as a bare "1". */
export const ratioText = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : NA);

/** Minutes since midnight as 'HH:MM' (wraps at 24h). */
export function clock(totalMinutes: number): string {
  const m = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
