// Hex mirror of the CSS colour tokens, for canvas code (canvas can't read var()).
// src/styles/global.css stays the source of truth; assertTokensInSync() checks
// this table against it once in dev.

export const TOKENS = {
  bg: '#0a0c11',
  bg2: '#0e1118',
  panel: '#121622',
  panel2: '#181d2b',
  line: '#242a3a',
  line2: '#323a4f',
  text: '#e8eaf0',
  muted: '#8a93a8',
  faint: '#5b6378',
  accent: '#7c5cff',
  hi: '#ffd166',
  ok: '#3ddc97',
  bad: '#ff5d6c',
  info: '#4cc9f0',
  violet: '#a78bfa',
  dim: '#3a4152',
  cell: '#1a1f2d',
  cellLine: '#2d3447',
  orange: '#ff8c5a',
  amber: '#f7b538',
  pink: '#ff5d8f',
  sky: '#8fb8ff',
  land: '#2a3246',
} as const;

export type TokenName = keyof typeof TOKENS;

/** CSS custom property name for a token: 'cellLine' → '--cell-line', 'bg2' → '--bg-2'. */
export const tokenProperty = (t: TokenName) =>
  `--${t.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\D)(\d)$/, '$1-$2')}`;

/** 'var(--hi)' etc. In SVG/DOM, prefer this over a hex value. */
export const cssVar = (t: TokenName) => `var(${tokenProperty(t)})`;

/** A hex colour with alpha, for canvas: alpha('#ffd166', 0.3) → 'rgb(255 209 102 / 0.3)'. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

/** Hues for "one colour per thing" (servers, shards, replicas, projections...). */
export const CATEGORICAL: readonly TokenName[] = ['info', 'violet', 'ok', 'amber', 'pink', 'orange', 'hi', 'sky'];

/** The i-th categorical colour (wraps), as a CSS var for DOM/SVG or a hex for canvas. */
export function categorical(i: number, as: 'var' | 'hex' = 'var'): string {
  const token = CATEGORICAL[((i % CATEGORICAL.length) + CATEGORICAL.length) % CATEGORICAL.length];
  return as === 'var' ? cssVar(token) : TOKENS[token];
}

/** Dev-only: compare TOKENS with the live CSS once and report drift as a console error. */
export function assertTokensInSync(): void {
  const style = getComputedStyle(document.documentElement);
  const drift = (Object.keys(TOKENS) as TokenName[]).filter(
    (t) => style.getPropertyValue(tokenProperty(t)).trim().toLowerCase() !== TOKENS[t],
  );
  if (drift.length) {
    console.error(`palette.ts is out of sync with global.css for: ${drift.map(tokenProperty).join(', ')}`);
  }
}
