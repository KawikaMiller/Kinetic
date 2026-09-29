// Flag lesson code that bypasses the shared layer: raw colour literals instead of
// tokens, and local copies of helpers that live in src/core.
//
//   npm run check-tokens                 # all lessons, report only
//   npm run check-tokens -- raft sorting # just these
//   npm run check-tokens -- --strict     # exit 1 if anything is found
import fs from 'node:fs';
import path from 'node:path';
import { lessonIds, parseArgs, ROOT } from './lib/browser.mjs';

const RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b(?![\w-])/g },
  { name: 'rgb() literal', re: /\brgba?\(\s*\d/g },
  { name: 'local canvas palette', re: /const\s+C\s*=\s*\{/g },
  { name: 'local FNV hash', re: /0x811c9dc5|2166136261/g },
  { name: 'local seeded RNG', re: /function\s+mulberry32|0x6d2b79f5/g },
  { name: 'local percentile', re: /function\s+percentile\b/g },
  { name: 'local lerp/clamp01', re: /(?:const|function)\s+(?:lerp|clamp01)\b/g },
  { name: 'local roundBox', re: /function\s+roundBox\b/g },
  { name: 'hand-rolled queued play', re: /\bpendingPlay\b/g },
  { name: 'inline spring constant', re: /const\s+spring\s*=/g },
];
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

let total = 0;
for (const id of ids) {
  const counts = new Map();
  for (const file of filesIn(path.join(ROOT, 'src', 'lessons', id))) {
    const text = fs
      .readFileSync(file, 'utf8')
      // ignore comments so documentation can mention a colour
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const rule of RULES) {
      const hits = text.match(rule.re)?.length ?? 0;
      if (hits) counts.set(rule.name, (counts.get(rule.name) ?? 0) + hits);
    }
  }
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  total += sum;
  const detail = [...counts].map(([name, n]) => `${name}×${n}`).join(', ');
  console.log(`${sum ? 'hits' : 'ok  '} ${id.padEnd(26)} ${String(sum).padStart(4)}  ${detail}`);
}
console.log(`\n${total} hit(s) across ${ids.length} lesson(s)`);
process.exit(flags.strict && total ? 1 : 0);
