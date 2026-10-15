import type { FieldParse } from '../../core/parse';
import { parseIntegers } from '../../core/parse';
import { failedProperties, ALL_PROPS, BUGS, type BugId, type PropId } from './sorts';

/** Longest array a learner may type, and the largest magnitude of a value in it. */
export const CUSTOM_MAX_VALUES = 20;
export const CUSTOM_MAX_ABS = 1_000_000_000;

/** The learner's own array: at most 20 whole numbers, each within ±1e9, refused otherwise (never truncated or run). */
export function parseCustomArray(text: string): FieldParse<number[]> {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: `Type up to ${CUSTOM_MAX_VALUES} whole numbers, like 10, 2, -3.` };
  if (tokens.length > CUSTOM_MAX_VALUES) return { ok: false, error: `That is ${tokens.length} values; up to ${CUSTOM_MAX_VALUES} are tested.` };
  const values = parseIntegers(text);
  if (!values) return { ok: false, error: 'Use whole numbers only, separated by commas or spaces.' };
  if (values.some((v) => Math.abs(v) > CUSTOM_MAX_ABS)) return { ok: false, error: `Keep each value between −${CUSTOM_MAX_ABS.toLocaleString('en-US')} and ${CUSTOM_MAX_ABS.toLocaleString('en-US')}.` };
  return { ok: true, value: values };
}

export interface CustomRow {
  bug: BugId;
  output: number[];
  failed: PropId[];
}

/** The learner's array run through every function against every property. */
export function runCustom(input: readonly number[]): CustomRow[] {
  return BUGS.map((b) => ({ bug: b.id, output: b.fn([...input]), failed: failedProperties(ALL_PROPS, input, b.fn) }));
}
