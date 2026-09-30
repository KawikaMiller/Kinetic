// Flag lesson code that bypasses the shared layer: raw colour literals instead of
// tokens, and local copies of helpers that live in src/core.
//
//   npm run check-tokens                 # all lessons, counts per lesson
//   npm run check-tokens -- raft sorting # just these
//   npm run check-tokens -- --list       # print every hit as file:line
//   npm run check-tokens -- --strict     # exit 1 if anything is found (part of "done")
//
// A colour literal that genuinely can't be a token (a brand colour, a mid-tone that
// belongs to one drawing) is allowed with a marker on the same line, with a reason:
//   color: #2b1d0e; /* allow-color: coffee-cup illustration */
//   ctx.fillStyle = '#123'; // allow-color: …
import fs from 'node:fs';
import path from 'node:path';
import { lessonIds, parseArgs, ROOT } from './lib/browser.mjs';

const COLOR_RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b(?![\w-])/g },
  { name: 'rgb() literal', re: /\brgba?\(\s*\d/g },
];
const HELPER_RULES = [
  { name: 'local canvas palette', re: /const\s+C\s*=\s*\{/g },
  { name: 'local FNV hash', re: /0x811c9dc5|2166136261/g },
  { name: 'local seeded RNG', re: /function\s+mulberry32|0x6d2b79f5/g },
  { name: 'local percentile', re: /function\s+percentile\b/g },
  { name: 'local lerp/clamp01', re: /(?:const|function)\s+(?:lerp|clamp01)\b/g },
  { name: 'local roundBox', re: /function\s+roundBox\b/g },
  { name: 'hand-rolled queued play', re: /\bpendingPlay\b/g },
  { name: 'inline spring constant', re: /const\s+spring\s*=/g },
];
/** `allow-color:` followed by a reason. A bare marker doesn't count. */
const ALLOW = /allow-color:\s*\S/;
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

const { flags, positional } = parseArgs();
const ids = positional.length ? positional : lessonIds();

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full);
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

/** Source lines with comments blanked out, keeping line numbers (so documentation can mention a colour). */
function codeLines(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'));
}

let total = 0;
let allowed = 0;
for (const id of ids) {
  const counts = new Map();
  const where = [];
  for (const file of filesIn(path.join(ROOT, 'src', 'lessons', id))) {
    const raw = fs.readFileSync(file, 'utf8');
    const rawLines = raw.split('\n');
    codeLines(raw).forEach((line, i) => {
      const marked = ALLOW.test(rawLines[i]);
      for (const rule of [...COLOR_RULES, ...HELPER_RULES]) {
        const hits = line.match(rule.re)?.length ?? 0;
        if (!hits) continue;
        if (marked && COLOR_RULES.includes(rule)) {
          allowed += hits;
          continue;
        }
        counts.set(rule.name, (counts.get(rule.name) ?? 0) + hits);
        where.push(`  ${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  ${rule.name}: ${rawLines[i].trim().slice(0, 100)}`);
      }
    });
  }
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  total += sum;
  const detail = [...counts].map(([name, n]) => `${name}×${n}`).join(', ');
  console.log(`${sum ? 'hits' : 'ok  '} ${id.padEnd(26)} ${String(sum).padStart(4)}  ${detail}`);
  if (flags.list && where.length) console.log(where.join('\n'));
}
console.log(`\n${total} hit(s) across ${ids.length} lesson(s) · ${allowed} allowed by allow-color markers`);
process.exit(flags.strict && total ? 1 : 0);
