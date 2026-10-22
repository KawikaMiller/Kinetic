/** Every string over `alphabet` from length 0 up to `max`, shortest first: the exhaustive-check input for automata tests. */
export function stringsUpTo(alphabet: readonly string[], max: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    for (const s of layer) out.push(s);
  }
  return out;
}
