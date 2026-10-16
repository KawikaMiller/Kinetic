/** The state each scene opens in (pure, so a test can switch through all of them and check none leaks into another). */
import { MAX_REPLAYS, type Policy, type RequestKind } from './earlyData';
import type { Stack } from './flights';
import { DEFAULT_LOST } from './hol';

export const RTT_RANGE = { min: 10, max: 300, step: 5 } as const;
export const THINK_RANGE = { min: 0, max: 200, step: 10 } as const;
export const DEFAULT_RTT = 100;
export const DEFAULT_THINK = 20;

export interface Preset {
  id: string;
  label: string;
  rttMs: number;
  /** Said under the presets when the real figure is outside the slider. */
  note?: string;
}
export const PRESETS: readonly Preset[] = [
  { id: 'mobile', label: 'mobile (RTT 120 ms)', rttMs: 120 },
  { id: 'city', label: 'same city (RTT 15 ms)', rttMs: 15 },
  {
    id: 'satellite',
    label: 'satellite (RTT 600 ms; slider stops at 300)',
    rttMs: RTT_RANGE.max,
    note: 'A satellite path in orbit is around 600 ms (from memory); the slider stops at 300 ms, so this shows half of it.',
  },
];

export interface HandshakeState {
  rttMs: number;
  thinkMs: number;
  /** Whose messages the sequence diagram shows. */
  stack: Stack;
  note: string | null;
}
export const initialHandshake = (): HandshakeState => ({ rttMs: DEFAULT_RTT, thinkMs: DEFAULT_THINK, stack: 'quic', note: null });

export interface EarlyState {
  rttMs: number;
  request: RequestKind;
  policy: Policy;
  replays: number;
}
export const initialEarly = (): EarlyState => ({ rttMs: DEFAULT_RTT, request: 'post', policy: 'accept', replays: 0 });
export const replay = (s: EarlyState): EarlyState => ({ ...s, replays: Math.min(MAX_REPLAYS, s.replays + 1) });

export interface HolState {
  rttMs: number;
  lost: readonly number[];
}
export const initialHol = (): HolState => ({ rttMs: DEFAULT_RTT, lost: DEFAULT_LOST });

export interface MigrateState {
  rttMs: number;
  udpBlocked: boolean;
}
export const initialMigrate = (): MigrateState => ({ rttMs: DEFAULT_RTT, udpBlocked: false });

export const applyPreset = <T extends { rttMs: number }>(s: T, p: Preset): T => ({ ...s, rttMs: p.rttMs });
