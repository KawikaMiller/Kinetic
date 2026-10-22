import { CAPACITY, ITEMS, RANGES_DEFAULT, orderBy, type Item } from './model';

export type SceneId = 'plane' | 'cost' | 'ranges' | 'line' | 'story';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. */
export const OPENING = {
  scene: 'plane' as SceneId,
  plane: { items: ITEMS.map((i): Item => ({ ...i })), week: 13 },
  /** The cost scene opens on "highest impact first", so there is an extra cost to find. */
  cost: { order: orderBy(ITEMS, 'impact'), dependencyOn: false },
  ranges: { ...RANGES_DEFAULT },
  line: { capacity: CAPACITY.default },
};
