import { hash32 } from '../../core/hash';
import { cssVar } from '../../core/palette';
import { modOwner, RING, ringOwner, ringPoints } from './hash';

/** Server names, in the order "+ Add server" brings them in. */
export const ALL_SERVERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** The servers the lesson starts with. */
export const START_SERVERS = ALL_SERVERS.slice(0, 4);

/** The fewest servers a change may leave. */
export const MIN_SERVERS = 2;

/**
 * One hue per server, none of them a status colour: the semantic roles (--ok, --bad, --hi) keep
 * their meanings on this stage ("just moved", the costly scheme), so the servers use the
 * categorical and track hues instead.
 */
export const SERVER_COLORS: Record<string, string> = {
  A: cssVar('sky'),
  B: cssVar('orange'),
  C: cssVar('pink'),
  D: cssVar('trkHw'),
  E: cssVar('trkMath'),
  F: cssVar('trkLang'),
  G: cssVar('trkWeb'),
  H: cssVar('trkCraft'),
};

export const KEY_COUNT = 100;

/** Virtual-node slider range. */
export const VNODE_RANGE = { min: 1, max: 50 } as const;

/** The busiest server's load, as a multiple of the fair share, above which its stat turns red. */
export const LOAD_BAD = 1.5;
/** ...and at or below which it turns green. */
export const LOAD_OK = 1.2;

export interface Key {
  i: number;
  name: string;
  h: number;
  /** 0..1 around the ring. */
  pos: number;
}

export const makeKeys = (count: number): Key[] =>
  Array.from({ length: count }, (_, i) => {
    const name = `user:${i + 1}`;
    const h = hash32(name);
    return { i, name, h, pos: h / RING };
  });

export const KEYS: Key[] = makeKeys(KEY_COUNT);

/** Who owns every key, under both schemes, for this set of servers. */
export function owners(servers: string[], vnodes: number, keys: readonly Key[] = KEYS) {
  const pts = ringPoints(servers, vnodes);
  return {
    pts,
    ring: keys.map((k) => ringOwner(pts, k.pos).server),
    mod: keys.map((k) => modOwner(servers, k.h)),
  };
}

/** What one server joining or leaving did to the keys, under both schemes. */
export interface Change {
  /** Key indexes whose owner changed on the ring / under hash % N. */
  ringMoved: Set<number>;
  modMoved: Set<number>;
  /** Servers that lost at least one key on the ring, and servers that gained one. */
  ringDonors: string[];
  ringTakers: string[];
  /** The server that joined or left. */
  server: string;
  joined: boolean;
}

const distinct = (xs: string[]) => [...new Set(xs)];

/** Compare the owners before and after one server joined (or left): the sets differ by exactly one. */
export function compareChange(
  before: string[], after: string[], vnodes: number, keys: readonly Key[] = KEYS,
): Change {
  const joined = after.length > before.length;
  const server = (joined ? after.find((s) => !before.includes(s)) : before.find((s) => !after.includes(s))) ?? '';
  const was = owners(before, vnodes, keys);
  const now = owners(after, vnodes, keys);
  const moved = (a: string[], b: string[]) => new Set(keys.filter((k) => a[k.i] !== b[k.i]).map((k) => k.i));
  const ringMoved = moved(was.ring, now.ring);
  return {
    ringMoved,
    modMoved: moved(was.mod, now.mod),
    ringDonors: distinct([...ringMoved].map((i) => was.ring[i])),
    ringTakers: distinct([...ringMoved].map((i) => now.ring[i])),
    server,
    joined,
  };
}

/** Keys held by each server, in the order of `servers`. */
export const countKeys = (servers: string[], own: string[]) => servers.map((s) => own.filter((o) => o === s).length);

/** The busiest server's load as a multiple of the fair share (keys ÷ servers). */
export const busiestRatio = (counts: number[], keyCount: number) => Math.max(...counts) / (keyCount / counts.length);

/** Red above LOAD_BAD, green at or below LOAD_OK, uncoloured in between (a middling load is not a status). */
export const loadColor = (ratio: number): string | undefined =>
  ratio > LOAD_BAD ? 'var(--bad)' : ratio <= LOAD_OK ? 'var(--ok)' : undefined;
