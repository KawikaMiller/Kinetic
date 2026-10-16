/** Legend entries for the cells every grid can show. */
export const WORLD_LEGEND = [
  { color: 'var(--ok)', label: 'goal, +1', shape: 'square' as const },
  { color: 'var(--bad)', label: 'pit, -1', shape: 'square' as const },
  { color: 'var(--hi)', label: 'cookie, +0.3', shape: 'square' as const },
  { color: 'var(--dim)', label: 'wall', shape: 'square' as const },
];
