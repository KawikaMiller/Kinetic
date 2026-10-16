/**
 * The state each scene opens in (pure functions, so a test can switch through every scene and
 * check none leaks into another), and the learner's edits to a link: cut, restore, set a cost.
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import type { SplitMode } from './dv';
import { DEFAULT_LS, LS_BROKEN_SEED, type LsSetup } from './ls';
import { COST_MAX, COST_MIN, PRESETS, linkId, presetById, presetLinks, presetTopo, type Link, type StartKind, type Topo } from './topology';

// ---- scene 1 ---------------------------------------------------------------------------------

export interface ForwardState {
  src: string;
  dst: string;
  destination: string;
}
export const FORWARD_DESTINATION = '198.51.100.130';
export const initialForward = (): ForwardState => ({ src: 'A', dst: 'F', destination: FORWARD_DESTINATION });

// ---- scene 2 ---------------------------------------------------------------------------------

export interface DvState {
  presetId: string;
  links: Link[];
  start: StartKind;
  mode: SplitMode;
  /** The link the cut / cost controls act on, or null. */
  selected: string | null;
  /** What is typed in the cost field. */
  costText: string;
  /** The last thing the link controls did or refused, shown under them. */
  note: string | null;
}

export const DV_DEFAULT_PRESET = 'chain';
export function loadDvPreset(presetId: string, mode: SplitMode): DvState {
  const p = presetById(presetId);
  return { presetId: p.id, links: presetTopo(p).links.map((l) => ({ ...l })), start: p.start, mode, selected: null, costText: '', note: `Loaded "${p.label}".` };
}
export const initialDv = (): DvState => ({ ...loadDvPreset(DV_DEFAULT_PRESET, 'plain'), note: null });

export const dvTopo = (presetId: string, links: Link[]): Topo => ({ routers: presetById(presetId).routers, links });
/** The network as the preset draws it before anything is cut: what the tables settled on. */
export const dvBaseline = (presetId: string): Topo => ({ routers: presetById(presetId).routers, links: presetLinks(presetById(presetId)) });

export const selectLink = (s: DvState, id: string): DvState => {
  const l = s.links.find((x) => x.id === id);
  return { ...s, selected: id, costText: l ? String(l.cost) : '', note: l ? `Selected link ${l.a}-${l.b}.` : s.note };
};

export function toggleSelected(s: DvState): DvState {
  const l = s.links.find((x) => x.id === s.selected);
  if (!l) return { ...s, note: 'Select a link first: click one in the drawing.' };
  return { ...s, links: s.links.map((x) => (x.id === l.id ? { ...x, up: !x.up } : x)), note: `Link ${l.a}-${l.b} is ${l.up ? 'cut' : 'back up'}.` };
}

const shorten = (typed: string) => (typed.length > 14 ? `${typed.slice(0, 14)}…` : typed);
export const parseCost = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: COST_MIN,
    max: COST_MAX,
    messages: {
      empty: `Type a cost from ${COST_MIN} to ${COST_MAX}.`,
      invalid: (typed) => `"${shorten(typed)}" is not a cost: use a whole number from ${COST_MIN} to ${COST_MAX}.`,
      tooSmall: () => `A cost below ${COST_MIN} is refused: costs start at ${COST_MIN} (0 would make the link free).`,
      tooBig: () => `A cost above ${COST_MAX} is refused: costs run from ${COST_MIN} to ${COST_MAX}.`,
    },
  });

export function applyCost(s: DvState): DvState {
  const l = s.links.find((x) => x.id === s.selected);
  if (!l) return { ...s, note: 'Select a link first: click one in the drawing.' };
  const r = parseCost(s.costText);
  if (!r.ok) return { ...s, note: `${r.error} Keeping cost ${l.cost}.` };
  return { ...s, links: s.links.map((x) => (x.id === l.id ? { ...x, cost: r.value } : x)), costText: String(r.value), note: `Link ${l.a}-${l.b} now costs ${r.value}.` };
}

// ---- scene 3 ---------------------------------------------------------------------------------

export interface LsUi {
  setup: LsSetup;
  /** Whose shortest-path tree is drawn. */
  router: string;
}
export const initialLs = (): LsUi => ({ setup: { ...DEFAULT_LS }, router: 'D' });

/** The link scene 3 cuts by default in a preset: the one the preset cuts in scene 2, else its first link. */
export function defaultLink(presetId: string): string {
  const p = presetById(presetId);
  return p.cut[0] ?? linkId(p.links[0][0], p.links[0][1]);
}

/** Load a preset into scene 3: its default cut, and the learner's mode, delivery and seed kept. */
export function loadLsPreset(ui: LsUi, presetId: string): LsUi {
  const p = presetById(presetId);
  return { setup: { ...ui.setup, presetId: p.id, link: defaultLink(p.id), restore: false }, router: p.routers[Math.min(3, p.routers.length - 1)] };
}

export type LinkEvent = 'none' | 'cut' | 'restore';
export const linkEventOf = (s: LsSetup): LinkEvent => (s.link === null ? 'none' : s.restore ? 'restore' : 'cut');
export const withLinkEvent = (s: LsSetup, event: LinkEvent): LsSetup => ({
  ...s,
  link: event === 'none' ? null : (s.link ?? defaultLink(s.presetId)),
  restore: event === 'restore',
});

/** Moving one end of the delay range moves the other with it, so the range is never upside down. */
export const withDelay = (s: LsSetup, end: 'min' | 'max', ms: number): LsSetup =>
  end === 'min' ? { ...s, minMs: ms, maxMs: Math.max(s.maxMs, ms) } : { ...s, maxMs: ms, minMs: Math.min(s.minMs, ms) };

/** The setup of the scripted reordering: the ring, link A-B cut at 15 ms, the first A-to-F message slow. */
export const scriptedSetup = (mode: LsSetup['mode']): LsSetup => ({ ...DEFAULT_LS, mode, delivery: 'scripted', link: 'AB', restore: false, presetId: 'ring' });

export const brokenRandomSetup = (): LsSetup => ({ ...DEFAULT_LS, mode: 'ignore', seed: LS_BROKEN_SEED });

export const PRESET_OPTIONS = PRESETS.map((p) => ({ id: p.id, label: p.label }));
