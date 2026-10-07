// Mixing CSS colours like paint: the stand-in for Diffie-Hellman in diffie-hellman and tls-handshake.

/**
 * Equal parts of every colour, as one real CSS colour: a color-mix() fold in the order given, each
 * step weighted so every colour ends up with the same share (the k-th joins at 1/(k+1)). Callers
 * pass the colours in a canonical order (sorted parts), so the result depends only on which paints
 * went in, never on the order they were added. That order-independence is what the analogy rests on.
 *
 *   equalMix(['var(--amber)', 'var(--sky)'])  // 'color-mix(in oklab, var(--amber) 50%, var(--sky))'
 */
export function equalMix(colors: readonly string[]): string {
  if (!colors.length) throw new RangeError('equalMix needs at least one colour');
  let color = colors[0];
  colors.slice(1).forEach((next, i) => {
    const sofar = i + 1;
    color = `color-mix(in oklab, ${color} ${Math.round((sofar / (sofar + 1)) * 100)}%, ${next})`;
  });
  return color;
}
