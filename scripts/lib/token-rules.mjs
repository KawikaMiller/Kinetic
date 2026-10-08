// The rules check-tokens applies to lesson source, kept apart from the file walking so they
// can be tested (scripts/lib/token-rules.test.mjs).

export const COLOR_RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b(?![\w-])/g },
  { name: 'rgb() literal', re: /\brgba?\(\s*\d/g },
];

export const HELPER_RULES = [
  { name: 'local canvas palette', re: /const\s+C\s*=\s*\{/g },
  { name: 'local FNV hash', re: /0x811c9dc5|2166136261/g },
  { name: 'local seeded RNG', re: /function\s+mulberry32|0x6d2b79f5/g },
  { name: 'local percentile', re: /function\s+percentile\b/g },
  { name: 'local lerp/clamp01', re: /(?:const|function)\s+(?:lerp|clamp01)\b/g },
  { name: 'local roundBox', re: /function\s+roundBox\b/g },
  { name: 'hand-rolled queued play', re: /\bpendingPlay\b/g },
  // core/ipv4 owns dotted-quad parsing/formatting and the prefix-mask shift.
  { name: 'local IPv4 maths', re: /(?:const|function)\s+(?:parseIPv4|ipToString)\b|0xffffffff\s*<</g },
  // An anonymous spring literal in a transition prop: magic numbers with no name. Use a
  // SPRING preset (core/motion) or a named module constant. Matches on the object, not
  // on a variable called "spring", so a season or a DST "spring forward" isn't flagged.
  { name: 'inline spring literal', re: /transition=\{\{\s*type:\s*['"]spring['"]/g },
  // Exponents are real font glyphs: core/format power(k) writes 2^k as '2ᵏ'.
  { name: 'hand-rolled <sup>', re: /<sup[\s>]/g },
];

// `allow-color:` followed by a reason. A bare marker doesn't count, and neither does the
// closing star-slash of the comment the marker sits in.
const ALLOW = /allow-color:\s*(?!\*\/)\S/;

/** Source lines with comments blanked out, keeping line numbers (so documentation can mention a colour). */
export function codeLines(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'));
}

/**
 * Every rule hit in one file's text: { line (1-based), rule, count, allowed }. Colour hits on a
 * line carrying an `allow-color: <reason>` marker come back with allowed: true.
 */
export function findHits(text) {
  const rawLines = text.split('\n');
  const hits = [];
  codeLines(text).forEach((line, i) => {
    const marked = ALLOW.test(rawLines[i]);
    for (const rule of [...COLOR_RULES, ...HELPER_RULES]) {
      const count = line.match(rule.re)?.length ?? 0;
      if (count) hits.push({ line: i + 1, rule: rule.name, count, allowed: marked && COLOR_RULES.includes(rule) });
    }
  });
  return hits;
}
