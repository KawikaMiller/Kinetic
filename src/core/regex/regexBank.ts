/** Shared by the core/regex tests and the regex-engines lesson tests: the 40-pattern bank and its oracle helpers. */
import { buildNfa, parsePattern, type ParsedRegex } from './index';

export const BANK = [
  'a', 'ab', 'a|b', 'a*', 'a+', 'a?', '(ab)*', '(ab)+', 'a(b|c)*d', 'a?b*', 'colou?r', '(a|b)*c', '[ab]*c', '[abc]+', 'a.b', '.*', '.+a',
  '(a*)*b', '(a|ab)(c|bcd)', 'a|ab', 'ab|a', '(a|b)*abb', '[ab]*a[ab][ab]', '(a+b+)+', 'a*b*c*', '(ab|a)(bc|c)?', '((a|b)c)*', '(a?)*',
  '(a|b|c)+', 'c*a*', '(abc)?', 'a(bc)*', '(a*|b)*c', '(a|bc)*', 'b+(a|c)?', '(.)(.)', '[ab][bc]', '(a|b)(b|c)(a|c)', 'a?a?a?', '(ab*)+c?',
];

export const parse = (p: string): ParsedRegex => {
  const r = parsePattern(p);
  if (!r.ok) throw new Error(`${p}: ${r.error}`);
  return r.value;
};

export const construct = (p: string) => {
  const r = buildNfa(parse(p));
  if (!r.ok) throw new Error(`${p}: ${r.error}`);
  return r.value;
};

/** Every string over a, b, c of length 0 to `max`. */
function strings(max: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => ['a', 'b', 'c'].map((ch) => s + ch));
    out.push(...layer);
  }
  return out;
}

export const SUBJECTS = strings(8);

/** The real RegExp as a full-match oracle; only ever given lesson-authored patterns, in tests. */
export const full = (p: string) => new RegExp(`^(?:${p})$`);
