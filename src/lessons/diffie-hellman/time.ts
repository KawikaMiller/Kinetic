import { humanDuration, power } from '../../core/format';

const YEAR_LOG10 = Math.log10(365.25 * 86400);
/** Below this many log₁₀ seconds the value fits a Number comfortably: let humanDuration word it. */
const PLAIN_LIMIT = 15;

/**
 * A duration given as log₁₀ seconds, so a 617-digit search (10⁶⁰⁸ s) stays finite:
 * humanDuration while it fits, then "about 10ⁿ years".
 */
export function vastDuration(log10Seconds: number): string {
  if (log10Seconds < PLAIN_LIMIT) return humanDuration(10 ** log10Seconds);
  return `about ${power(Math.round(log10Seconds - YEAR_LOG10), 10)} years`;
}
