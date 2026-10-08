// Glued-sentence detection for caption text. Dependency-free on purpose: the Vitest helper in
// ./captions.ts uses it, and so does scripts/captions.mjs, which Node runs with its built-in
// type stripping (so: no imports, no TS-only syntax such as enums).

/**
 * A word or closing bracket, then sentence punctuation, then the next sentence with no space:
 * "port.60 s", "done.Then", "this;Then". This is what a JSX line break next to `{…}` produces,
 * since JSX drops a line break that touches an expression. A colon only counts before a capital,
 * so times, ports and MAC addresses ("localhost:3000", "00:1a:2b") pass.
 */
const GLUED = /[a-z)\]](?:[.!?;,][A-Z0-9]|:[A-Z])/g;
/** Characters of context shown either side of a hit. */
const CONTEXT = 12;

/**
 * The word before the punctuation looks like code or a number, not prose: it holds a digit or a
 * dot, colon, slash, underscore or similar ("1.5.0-beta.1", "libc.so.6", "process.env.KEY").
 */
const CODE_BEFORE = /[\d.:/_@#$=^]/;
/** The word after is an identifier, not a sentence start: a capital inside it or an underscore ("Intl.NumberFormat", "Integer.MAX_VALUE"). */
const CODE_AFTER = /^[A-Za-z]+[A-Z_]/;

/** Stand-in for inline code, so `Math.PI` or `a,B` inside code never counts as glued prose. */
export const CODE_PLACEHOLDER = 'x';

/**
 * The glued spots in `text`, each as a short snippet around the hit (empty: none). Blank inline
 * code to CODE_PLACEHOLDER first; code next to prose still counts ("see `f`.Then" is glued).
 * Prose that is really a dotted name ("queue.Queue") can still match: put it in backticks or `<code>`.
 */
export function gluedSentences(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(GLUED)) {
    const at = m.index ?? 0;
    const punct = at + 1;
    const before = text.slice(0, punct).split(/\s/).pop() ?? '';
    const after = text.slice(punct + 1).split(/\s/)[0];
    if (CODE_BEFORE.test(before.replace(/^[("'[]+/, '')) || CODE_AFTER.test(after)) continue;
    hits.push(text.slice(Math.max(0, at - CONTEXT), at + m[0].length + CONTEXT));
  }
  return hits;
}
