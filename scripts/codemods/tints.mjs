// One-shot, mechanical conversion of lesson CSS colour literals to tokens.
// Meant to be pixel-identical:
//   rgb(R G B / a)  (token RGB)   -> color-mix(in srgb, var(--tok) {a*100}%, transparent)
//   rgb(R G B)      (token RGB)   -> var(--tok)
//   #hex            (exact token) -> var(--tok)
// Only exact token values are touched; everything else is left alone.
//
//   node scripts/codemods/tints.mjs          # rewrite files, print a summary
//   node scripts/codemods/tints.mjs --dry    # report only
import fs from 'node:fs';
import path from 'node:path';
import { lessonIds, parseArgs, ROOT } from '../lib/browser.mjs';

/** Token name by exact hex value (lower-case, 6 digits). Order matters only for duplicates. */
const TOKEN_HEX = {
  '#ffd166': 'hi',
  '#3ddc97': 'ok',
  '#ff5d6c': 'bad',
  '#4cc9f0': 'info',
  '#a78bfa': 'violet',
  '#3a4152': 'dim',
  '#7c5cff': 'accent',
  '#0a0c11': 'bg',
  '#0e1118': 'bg-2',
  '#121622': 'panel',
  '#181d2b': 'panel-2',
  '#242a3a': 'line',
  '#323a4f': 'line-2',
  '#e8eaf0': 'text',
  '#8a93a8': 'muted',
  '#5b6378': 'faint',
  '#1a1f2d': 'cell',
  '#2d3447': 'cell-line',
  '#ff8c5a': 'orange',
  '#f7b538': 'amber',
  '#ff5d8f': 'pink',
  '#8fb8ff': 'sky',
  // ink on solid fills: today's literals, promoted to tokens as-is
  '#1a1400': 'on-hi',
  '#04160d': 'on-ok',
  '#1f0508': 'on-bad',
  '#03202b': 'on-info',
  '#150a33': 'on-violet',
};

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('');

function alphaPercent(raw) {
  const a = raw.endsWith('%') ? parseFloat(raw) : parseFloat(raw) * 100;
  return `${Number(a.toFixed(3))}%`;
}

function convert(css, counts) {
  let out = css.replace(
    /\brgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[/,]\s*([\d.]+%?))?\s*\)/g,
    (match, r, g, b, a) => {
      const token = TOKEN_HEX[toHex(r, g, b)];
      if (!token) return match;
      counts.rgb++;
      if (a == null || parseFloat(a) === 1 || a === '100%') return `var(--${token})`;
      return `color-mix(in srgb, var(--${token}) ${alphaPercent(a)}, transparent)`;
    },
  );
  out = out.replace(/#([0-9a-fA-F]{6})\b/g, (match) => {
    const token = TOKEN_HEX[match.toLowerCase()];
    if (!token) return match;
    counts.hex++;
    return `var(--${token})`;
  });
  return out;
}

const { flags } = parseArgs();
const totals = { files: 0, rgb: 0, hex: 0 };
for (const id of lessonIds()) {
  const dir = path.join(ROOT, 'src', 'lessons', id);
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const file = path.join(dir, name);
    const before = fs.readFileSync(file, 'utf8');
    const counts = { rgb: 0, hex: 0 };
    const after = convert(before, counts);
    if (after === before) continue;
    totals.files++;
    totals.rgb += counts.rgb;
    totals.hex += counts.hex;
    if (!flags.dry) fs.writeFileSync(file, after);
    console.log(`${id}/${name}: ${counts.rgb} rgb, ${counts.hex} hex`);
  }
}
console.log(`\n${flags.dry ? 'would convert' : 'converted'} ${totals.rgb} rgb + ${totals.hex} hex literals in ${totals.files} files`);
