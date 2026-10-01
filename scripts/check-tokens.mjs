// Flag lesson code that bypasses the shared layer: raw colour literals instead of
// tokens, and local copies of helpers that live in src/core. The rules themselves are in
// lib/token-rules.mjs (with tests).
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
import { findHits } from './lib/token-rules.mjs';

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
let allowed = 0;
for (const id of ids) {
  const counts = new Map();
  const where = [];
  for (const file of filesIn(path.join(ROOT, 'src', 'lessons', id))) {
    const raw = fs.readFileSync(file, 'utf8');
    const rawLines = raw.split('\n');
    for (const hit of findHits(raw)) {
      if (hit.allowed) {
        allowed += hit.count;
        continue;
      }
      counts.set(hit.rule, (counts.get(hit.rule) ?? 0) + hit.count);
      where.push(`  ${path.relative(ROOT, file).replace(/\\/g, '/')}:${hit.line}  ${hit.rule}: ${rawLines[hit.line - 1].trim().slice(0, 100)}`);
    }
  }
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  total += sum;
  const detail = [...counts].map(([name, n]) => `${name}×${n}`).join(', ');
  console.log(`${sum ? 'hits' : 'ok  '} ${id.padEnd(26)} ${String(sum).padStart(4)}  ${detail}`);
  if (flags.list && where.length) console.log(where.join('\n'));
}
console.log(`\n${total} hit(s) across ${ids.length} lesson(s) · ${allowed} allowed by allow-color markers`);
process.exit(flags.strict && total ? 1 : 0);
