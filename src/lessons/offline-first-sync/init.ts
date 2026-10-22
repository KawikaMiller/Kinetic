/** The state each scene opens in (pure, so a test can switch through all of them) and the learner's edits. */
import type { FieldParse } from '../../core/parse';
import { BROKEN_SEED_ARRIVAL } from './seeds';
import { FAULT_SEED, LIVE_STEP_MS, LIVE_WAIT_MS, LOOP_SEED, SKEW_STEP_S, presetById, type Faults, type Loop, type PresetId } from './scenarios';
import type { Action, Airplane, Timed } from './nodes';
import { DEVICES, MAX_TITLE, type DeviceId, type Strategy } from './ops';

// ---- typed titles -------------------------------------------------------------------------------

/** A new item's title: 1 to MAX_TITLE characters after trimming, refused with the reason otherwise. Rendered as text only. */
export function parseNewTitle(text: string): FieldParse<string> {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Type a title for the new item first.' };
  if (t.length > MAX_TITLE) return { ok: false, error: `A title is at most ${MAX_TITLE} characters; this one has ${t.length}.` };
  return { ok: true, value: t };
}

/** A rename's title: at most MAX_TITLE characters. A blank one is allowed on the device, and the server refuses it. */
export function parseRename(text: string): FieldParse<string> {
  if (text.length > MAX_TITLE) return { ok: false, error: `A title is at most ${MAX_TITLE} characters; this one has ${text.length}.` };
  return { ok: true, value: text.trim() };
}

// ---- scene 1: the live list --------------------------------------------------------------------

export const LIVE_MAX_EDITS = 60;
const LIVE_START_MS = 3000;

export interface LiveState {
  script: Timed[];
  /** Airplane windows that have ended, and the time each device went offline if it still is. */
  closed: Airplane[];
  open: Record<DeviceId, number | null>;
  clock: number;
  drafts: Record<DeviceId, string>;
  note: string | null;
}
export const initialLive = (): LiveState => ({
  script: [{ at: 100, device: 'phone', action: { kind: 'add', title: 'Milk' } }],
  closed: [],
  open: { phone: null, laptop: null },
  clock: LIVE_START_MS,
  drafts: { phone: '', laptop: '' },
  note: null,
});

export const airplaneWindows = (s: LiveState): Airplane[] => [
  ...s.closed,
  ...DEVICES.flatMap((d) => (s.open[d] === null ? [] : [{ device: d, from: s.open[d] as number, to: Infinity }])),
];

export function liveEdit(s: LiveState, device: DeviceId, action: Action): LiveState {
  if (s.script.length >= LIVE_MAX_EDITS) return { ...s, note: `The list keeps at most ${LIVE_MAX_EDITS} edits; press Reset to start over.` };
  return { ...s, script: [...s.script, { at: s.clock, device, action }], clock: s.clock + LIVE_STEP_MS, note: null };
}

export function toggleAirplane(s: LiveState, device: DeviceId): LiveState {
  const since = s.open[device];
  const clock = s.clock + LIVE_STEP_MS;
  if (since === null) return { ...s, open: { ...s.open, [device]: s.clock }, clock, note: null };
  return { ...s, closed: [...s.closed, { device, from: since, to: s.clock }], open: { ...s.open, [device]: null }, clock, note: null };
}

export const liveWait = (s: LiveState): LiveState => ({ ...s, clock: s.clock + LIVE_WAIT_MS, note: null });
export const setDraft = (s: LiveState, device: DeviceId, text: string): LiveState => ({ ...s, drafts: { ...s.drafts, [device]: text } });

/** Add the draft as a new item, or refuse with the reason. */
export function liveAdd(s: LiveState, device: DeviceId): LiveState {
  const t = parseNewTitle(s.drafts[device]);
  if (!t.ok) return { ...s, note: t.error };
  return { ...liveEdit(s, device, { kind: 'add', title: t.value }), drafts: { ...s.drafts, [device]: '' } };
}

/** Rename the item at position `pick` to the draft; a blank draft is sent on purpose, for the server to refuse. */
export function liveRename(s: LiveState, device: DeviceId, pick: number): LiveState {
  const t = parseRename(s.drafts[device]);
  if (!t.ok) return { ...s, note: t.error };
  return liveEdit(s, device, { kind: 'rename', pick, title: t.value });
}

// ---- scene 2: the strategies ---------------------------------------------------------------------

export type Schedule = PresetId | 'random';
export interface StrategyState {
  strategy: Strategy;
  schedule: Schedule;
  skewSec: number;
  seed: number;
}
export const initialStrategy = (): StrategyState => ({ strategy: 'lww', schedule: 'rename', skewSec: 0, seed: BROKEN_SEED_ARRIVAL });

/** Picking the broken arrival-order mode opens on its pinned failing seed, on the seeded random schedule. */
export function pickStrategy(s: StrategyState, strategy: Strategy): StrategyState {
  if (strategy === 'arrival') return { ...s, strategy, schedule: 'random', seed: BROKEN_SEED_ARRIVAL };
  return { ...s, strategy };
}

/** Picking an example sets the clock skew it is about, so the chip and the slider always agree. */
export function pickSchedule(s: StrategyState, schedule: Schedule): StrategyState {
  return { ...s, schedule, skewSec: schedule === 'random' ? s.skewSec : presetById(schedule).skewSec };
}
export const SKEW_STEP = SKEW_STEP_S;

// ---- scene 3: delivery faults --------------------------------------------------------------------

export interface FaultState extends Faults {
  seed: number;
}
export const initialFaults = (): FaultState => ({ delay: 100, reorder: 300, lossPct: 20, dupPct: 40, dedupe: true, blank: false, seed: FAULT_SEED });

// ---- scene 4: the sync loop ----------------------------------------------------------------------

export interface LoopState extends Loop {
  seed: number;
}
export const initialLoop = (): LoopState => ({ outageSec: 20, edits: 3, capSec: 8, seed: LOOP_SEED });
