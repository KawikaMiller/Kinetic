// Pure helpers behind lane ① (the digests themselves come from core/crypto).

/** The input with exactly one character changed (its middle letter's case flipped, or swapped). */
export function tweakOneChar(s: string) {
  if (!s) return 'a';
  const i = Math.floor(s.length / 2);
  const c = s[i];
  const swapped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
  const next = swapped !== c ? swapped : c === 'x' ? 'y' : 'x';
  return s.slice(0, i) + next + s.slice(i + 1);
}

/** Characters that differ position by position, plus any length difference. */
export const charDiff = (a: string, b: string) => {
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
};

/** Bits that differ between two equal-length bit arrays. */
export const bitsFlipped = (a: number[], b: number[]) => a.reduce((n, bit, i) => n + (bit !== b[i] ? 1 : 0), 0);
