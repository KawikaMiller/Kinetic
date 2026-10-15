/**
 * Twelve hues for colours 1 to 12 (a graph has at most 12 nodes). They are kept at least CIEDE2000 18 away from each other
 * and from the status tokens (--hi, --ok, --bad, --info, --violet, --dim) and the other categorical tones, so a node colour
 * is never read as a status; colors.test.ts asserts the distances.
 */
export const COLOUR_HEX: readonly string[] = [
  '#0087d2', // allow-color: categorical node colour, checked against the tokens by colors.test.ts
  '#c35a00', // allow-color: categorical node colour
  '#ff3cff', // allow-color: categorical node colour
  '#96b400', // allow-color: categorical node colour
  '#009696', // allow-color: categorical node colour
  '#966978', // allow-color: categorical node colour
  '#6969a5', // allow-color: categorical node colour
  '#b4a587', // allow-color: categorical node colour
  '#4bff00', // allow-color: categorical node colour
  '#877800', // allow-color: categorical node colour
  '#ffb4b4', // allow-color: categorical node colour
  '#4b874b', // allow-color: categorical node colour
];

/** The CSS colour of colour number `c` (counting from 1). */
export const colourVar = (c: number): string => COLOUR_HEX[(c - 1) % COLOUR_HEX.length];
