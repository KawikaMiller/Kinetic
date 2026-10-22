/** The state each scene opens in (pure, so a test can switch through all of them) and the presets. */
import type { Scenario } from './ice';
import type { NatType } from './nat';
import { CALLS, SHARE } from './relay';

export interface PresetDef {
  id: 'home' | 'cgnat' | 'symmetric' | 'lan';
  label: string;
  scenario: Scenario;
  note: string;
}
export const PRESETS: PresetDef[] = [
  { id: 'home', label: 'both home routers', scenario: { a: 'port-restricted', b: 'port-restricted', sameLan: false }, note: 'Two ordinary routers, each port-restricted (a common home setup, from memory).' },
  { id: 'cgnat', label: 'carrier-grade NAT on one side', scenario: { a: 'port-restricted', b: 'symmetric', sameLan: false }, note: 'A provider-level NAT on one side that makes a new mapping per destination (often the case; verify).' },
  { id: 'symmetric', label: 'both symmetric (relay needed)', scenario: { a: 'symmetric', b: 'symmetric', sameLan: false }, note: 'Both sides make a new mapping per destination.' },
  { id: 'lan', label: 'same LAN (host candidate wins)', scenario: { a: 'port-restricted', b: 'port-restricted', sameLan: true }, note: 'Both peers sit behind one router on one network.' },
];
export const presetOf = (s: Scenario): PresetDef['id'] | null => PRESETS.find((p) => p.scenario.a === s.a && p.scenario.b === s.b && p.scenario.sameLan === s.sameLan)?.id ?? null;

// ---- scene 1 ----------------------------------------------------------------------------------

export interface StunState {
  a: NatType;
  b: NatType;
}
export const initialStun = (): StunState => ({ a: 'port-restricted', b: 'port-restricted' });

// ---- scene 2 ----------------------------------------------------------------------------------

export interface PunchState {
  a: NatType;
  b: NatType;
  /** Ticks later that peer B starts probing. */
  offset: number;
}
export const initialPunch = (): PunchState => ({ a: 'port-restricted', b: 'port-restricted', offset: 0 });

// ---- scene 3 ----------------------------------------------------------------------------------

export interface RelayState {
  a: NatType;
  b: NatType;
  calls: number;
  /** The learner's own assumption: the percentage of calls that need a relay. */
  share: number;
}
/** Opens on a pair that cannot punch, so the relay is the path in use. */
export const initialRelay = (): RelayState => ({ a: 'port-restricted', b: 'symmetric', calls: CALLS.initial, share: SHARE.initial });

// ---- scene 4 ----------------------------------------------------------------------------------

export const initialIce = (): Scenario => ({ ...PRESETS[0].scenario });
