/**
 * The small networks of the lesson: routers on a fixed canvas, links with a cost 1-9, and the
 * presets of scenes 2 and 3. Costs are symmetric, as in the textbook picture.
 */
import type { Adj } from './paths';

/** A route costing this much or more counts as unreachable (RIP's metric limit, from memory: verify against RFC 2453). */
export const INFINITY_COST = 16;
export const COST_MIN = 1;
export const COST_MAX = 9;

export interface Link {
  /** The two router ids joined, in order: 'AB'. */
  id: string;
  a: string;
  b: string;
  cost: number;
  up: boolean;
}

export interface Topo {
  routers: readonly string[];
  links: readonly Link[];
}

export interface Pt {
  x: number;
  y: number;
}

export type StartKind = 'change' | 'boot';

export interface Preset {
  id: string;
  label: string;
  routers: readonly string[];
  positions: Record<string, Pt>;
  /** Link costs; every link is up in the preset itself. */
  links: readonly [string, string, number][];
  /** Links cut when the preset loads. */
  cut: readonly string[];
  /** `change`: tables start converged and the cut happens; `boot`: every router starts knowing only itself. */
  start: StartKind;
}

export const linkId = (a: string, b: string): string => (a < b ? `${a}${b}` : `${b}${a}`);

const CX = 170;
const CY = 110;
const RING_RX = 125;
const RING_RY = 78;
const ringAt = (k: number): Pt => {
  const angle = ((-90 + 60 * k) * Math.PI) / 180;
  return { x: Math.round(CX + RING_RX * Math.cos(angle)), y: Math.round(CY + RING_RY * Math.sin(angle)) };
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'chain',
    label: 'chain, cut B-C',
    routers: ['A', 'B', 'C'],
    positions: { A: { x: 50, y: 110 }, B: { x: 170, y: 110 }, C: { x: 290, y: 110 } },
    links: [['A', 'B', 1], ['B', 'C', 1]],
    cut: ['BC'],
    start: 'change',
  },
  {
    id: 'triangle',
    label: 'triangle + stub, cut A-X',
    routers: ['A', 'B', 'C', 'X'],
    positions: { X: { x: 45, y: 110 }, A: { x: 130, y: 110 }, B: { x: 255, y: 45 }, C: { x: 255, y: 175 } },
    links: [['A', 'B', 1], ['A', 'C', 1], ['B', 'C', 1], ['A', 'X', 1]],
    cut: ['AX'],
    start: 'change',
  },
  {
    id: 'ring',
    label: 'ring of 6, cut A-B',
    routers: ['A', 'B', 'C', 'D', 'E', 'F'],
    positions: { A: ringAt(0), B: ringAt(1), C: ringAt(2), D: ringAt(3), E: ringAt(4), F: ringAt(5) },
    links: [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'E', 1], ['E', 'F', 1], ['A', 'F', 1]],
    cut: ['AB'],
    start: 'change',
  },
  {
    id: 'equal',
    label: 'two paths of equal cost',
    routers: ['A', 'B', 'C', 'D'],
    positions: { A: { x: 50, y: 110 }, B: { x: 170, y: 40 }, C: { x: 170, y: 180 }, D: { x: 290, y: 110 } },
    links: [['A', 'B', 1], ['A', 'C', 1], ['B', 'D', 1], ['C', 'D', 1]],
    cut: [],
    start: 'boot',
  },
];

export const presetById = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

/** The preset's links, all up and at their preset costs. */
export const presetLinks = (p: Preset): Link[] => p.links.map(([a, b, cost]) => ({ id: linkId(a, b), a, b, cost, up: true }));

/** The preset after its own cut: what the scene opens on. */
export function presetTopo(p: Preset): Topo {
  return { routers: p.routers, links: presetLinks(p).map((l) => ({ ...l, up: !p.cut.includes(l.id) })) };
}

/** The same links with every one up: the network before anything was cut. */
export const intactTopo = (t: Topo): Topo => ({ routers: t.routers, links: t.links.map((l) => ({ ...l, up: true })) });

export const withLink = (t: Topo, id: string, patch: Partial<Pick<Link, 'cost' | 'up'>>): Topo => ({
  routers: t.routers,
  links: t.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
});

/** Adjacency of the links that are up. */
export function adjacency(t: Topo): Adj {
  const adj: Adj = Object.fromEntries(t.routers.map((r) => [r, {} as Record<string, number>]));
  for (const l of t.links) {
    if (!l.up) continue;
    adj[l.a][l.b] = l.cost;
    adj[l.b][l.a] = l.cost;
  }
  return adj;
}

/** Neighbours of `r` across links that are up, in id order. */
export const neighbours = (t: Topo, r: string): string[] => Object.keys(adjacency(t)[r]).sort();

/** Scene 1's network: six routers, costs chosen so the cheapest A-to-F path is not the one with fewest hops. */
export const FORWARDING_PRESET: Preset = {
  id: 'forwarding',
  label: 'six routers',
  routers: ['A', 'B', 'C', 'D', 'E', 'F'],
  positions: { A: { x: 40, y: 110 }, B: { x: 125, y: 40 }, C: { x: 125, y: 180 }, D: { x: 235, y: 40 }, E: { x: 235, y: 180 }, F: { x: 305, y: 110 } },
  links: [['A', 'B', 2], ['A', 'C', 5], ['B', 'C', 1], ['B', 'D', 4], ['C', 'E', 2], ['D', 'E', 1], ['D', 'F', 3], ['E', 'F', 2]],
  cut: [],
  start: 'boot',
};

export const CANVAS = { width: 340, height: 220 } as const;
