// What the lesson's watch, console and logpoint boxes add to the shared expression evaluator (core/expr).
import { preview, type Value } from '../../core/expr';

export const SUPPORTED = 'names, numbers, strings, a.b, a[i], .length, + - * / %, comparisons, && || ?? !, ( )';

/** What console.log / a logpoint prints for a list of values: strings bare, the rest previewed. */
export const logLine = (values: readonly Value[]) => values.map((v) => preview(v, true)).join(' ');

/** Split a logpoint message on top-level commas: `'total', total` logs two values. */
export function splitArgs(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts.map((s) => s.trim());
}
