import { hash32 } from '../../core/hash';
import { cssVar } from '../../core/palette';
import { modOwner, RING, ringOwner, ringPoints } from './hash';

/** Server names, in the order "+ Add server" brings them in. */
export const ALL_SERVERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const SERVER_COLORS: Record<string, string> = {
  A: cssVar('info'),
  B: cssVar('violet'),
  C: cssVar('ok'),
  D: cssVar('hi'),
  E: cssVar('orange'),
  F: cssVar('pink'),
  G: cssVar('sky'),
  H: cssVar('amber'),
};

export const KEY_COUNT = 100;

export interface Key {
  i: number;
  name: string;
  h: number;
  /** 0..1 around the ring. */
  pos: number;
}

export const KEYS: Key[] = Array.from({ length: KEY_COUNT }, (_, i) => {
  const name = `user:${i + 1}`;
  const h = hash32(name);
  return { i, name, h, pos: h / RING };
});

/** Who owns every key, under both schemes, for this set of servers. */
export function owners(servers: string[], vnodes: number) {
  const pts = ringPoints(servers, vnodes);
  return {
    pts,
    ring: KEYS.map((k) => ringOwner(pts, k.pos).server),
    mod: KEYS.map((k) => modOwner(servers, k.h)),
  };
}
