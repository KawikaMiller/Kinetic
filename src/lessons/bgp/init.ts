/** The state each scene opens in (pure, so a test can switch through all of them and check none leaks into another) and the learner's edits. */
import { GRAPH, LEAKER, ORIGIN, neighboursOf, type Asn } from './asgraph';
import { DEFAULT_PREF, PREF_RANGE, finalRound, prefKey, propagate, type Config, type Policy } from './bgp';
import { DEFAULT_HIJACK, parseAnnounced, type Announced, type HijackSetup } from './hijack';

export const baseConfig = (over: Partial<Config> = {}): Config => ({ graph: GRAPH, origins: [{ asn: ORIGIN }], policy: 'valley-free', leaker: LEAKER, prefs: {}, ...over });

// ---- scene 1 ---------------------------------------------------------------------------------

export interface AnnounceState {
  /** Whose candidate table is shown. */
  selected: Asn;
}
/** AS64498 hears its own route back from its provider, so it opens on a discarded loop. */
export const initialAnnounce = (): AnnounceState => ({ selected: 64498 });

// ---- scene 2 ---------------------------------------------------------------------------------

export interface PolicyState {
  /** The AS whose local preferences are edited and whose choice is shown. */
  as: Asn;
  prefs: Record<string, number>;
}
export const initialPolicy = (): PolicyState => ({ as: 64499, prefs: {} });

export const prefFor = (s: PolicyState, nbr: Asn): number => {
  const rel = neighboursOf(GRAPH.edges, s.as).find((n) => n.asn === nbr)?.rel;
  return s.prefs[prefKey(s.as, nbr)] ?? (rel ? DEFAULT_PREF[rel] : DEFAULT_PREF.peer);
};
export const setPref = (s: PolicyState, nbr: Asn, value: number): PolicyState => ({ ...s, prefs: { ...s.prefs, [prefKey(s.as, nbr)]: value } });
/** Picking another AS keeps the preferences already set: they belong to the ASes that set them. */
export const pickAs = (s: PolicyState, as: Asn): PolicyState => ({ ...s, as });
export const policyRun = (s: PolicyState) => propagate(baseConfig({ prefs: s.prefs }));
export const preferProvider = (): PolicyState => ({ as: 64499, prefs: { [prefKey(64499, 64497)]: PREF_RANGE.max } });

/** ASes whose chosen path differs from the one the default business-relationship preferences give. */
export function changedFromDefault(s: PolicyState): Asn[] {
  const now = finalRound(policyRun(s)).best;
  const base = finalRound(propagate(baseConfig())).best;
  return GRAPH.ases.filter((a) => JSON.stringify(now[a]?.path ?? null) !== JSON.stringify(base[a]?.path ?? null));
}

// ---- scene 3 ---------------------------------------------------------------------------------

export interface LeakState {
  policy: Policy;
}
export const initialLeak = (): LeakState => ({ policy: 'valley-free' });

// ---- scene 4 ---------------------------------------------------------------------------------

export interface HijackState {
  setup: HijackSetup;
  /** What is typed in the prefix field; the setup holds the last prefix that was accepted. */
  field: string;
  note: string | null;
}
export const initialHijack = (): HijackState => ({ setup: { ...DEFAULT_HIJACK }, field: DEFAULT_HIJACK.prefixText, note: null });

export const announcedOf = (s: HijackSetup): Announced => {
  const r = parseAnnounced(s.prefixText);
  if (!r.ok) throw new RangeError(`the setup holds a prefix that was never accepted: ${s.prefixText}`);
  return r.value;
};

/** Accept the typed prefix, or keep the previous one and say why not. */
export function announcePrefix(s: HijackState, text: string = s.field): HijackState {
  const r = parseAnnounced(text);
  if (!r.ok) return { ...s, field: text, note: `${r.error} Keeping ${s.setup.prefixText}.` };
  const clean = text.trim();
  return { ...s, field: clean, setup: { ...s.setup, prefixText: clean }, note: `Announcing ${clean}.` };
}
