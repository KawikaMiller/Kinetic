/** The four scenes' scenarios as distSim configs: the scripted examples, the live list, the fault sliders and the sync loop. Pure. */
import { QUIET } from './check';
import type { Action, Airplane, ScenarioConfig, Timed } from './nodes';
import type { DeviceId, Strategy } from './ops';

const add = (at: number, device: DeviceId, title: string): Timed => ({ at, device, action: { kind: 'add', title } });
const act = (at: number, device: DeviceId, action: Action): Timed => ({ at, device, action });

/** Time the scripted examples run to: well after both devices are back online. */
export const PRESET_UNTIL_MS = 30_000;
const BOTH_OFFLINE: Airplane[] = [
  { device: 'phone', from: 2000, to: 7000 },
  { device: 'laptop', from: 2000, to: 7000 },
];
export const SKEW_STEP_S = 30;
export const SKEW_MAX_S = 600;
export const SKEW_PRESET_S = 300;

export type PresetId = 'rename' | 'delete-edit' | 'counter' | 'skew';
export interface PresetDef {
  id: PresetId;
  label: string;
  note: string;
  script: Timed[];
  /** The laptop clock skew this example is about, seconds. */
  skewSec: number;
}
export const PRESETS: PresetDef[] = [
  {
    id: 'rename',
    label: 'both rename the same item',
    note: 'Both devices go offline. The phone renames Milk to "Oat milk", the laptop to "Soy milk", then both reconnect.',
    script: [add(100, 'phone', 'Milk'), act(3000, 'phone', { kind: 'rename', pick: 0, title: 'Oat milk' }), act(3500, 'laptop', { kind: 'rename', pick: 0, title: 'Soy milk' })],
    skewSec: 0,
  },
  {
    id: 'delete-edit',
    label: 'one deletes while the other edits',
    note: 'Both devices go offline. The phone deletes Milk while the laptop renames it to "Milk (organic)".',
    script: [add(100, 'phone', 'Milk'), act(3000, 'phone', { kind: 'delete', pick: 0 }), act(3500, 'laptop', { kind: 'rename', pick: 0, title: 'Milk (organic)' })],
    skewSec: 0,
  },
  {
    id: 'counter',
    label: 'counter incremented on both',
    note: 'Both devices go offline. Each presses +1 on the shared counter once, then both reconnect.',
    script: [act(3000, 'phone', { kind: 'inc' }), act(3500, 'laptop', { kind: 'inc' })],
    skewSec: 0,
  },
  {
    id: 'skew',
    label: 'clock skew 5 minutes',
    note: 'The laptop clock is 5 minutes ahead. Offline, the laptop renames Milk to "Soy milk" first, and the phone renames it to "Oat milk" later.',
    script: [add(100, 'phone', 'Milk'), act(3000, 'laptop', { kind: 'rename', pick: 0, title: 'Soy milk' }), act(4000, 'phone', { kind: 'rename', pick: 0, title: 'Oat milk' })],
    skewSec: SKEW_PRESET_S,
  },
];

export const presetById = (id: PresetId): PresetDef => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export const presetConfig = (id: PresetId, strategy: Strategy, skewSec: number, dedupe = true, seed = 1): ScenarioConfig => ({
  seed,
  strategy,
  dedupe,
  ...QUIET,
  skewMs: skewSec * 1000,
  script: presetById(id).script,
  airplane: BOTH_OFFLINE,
  randomFaults: false,
});

// ---- the live list -----------------------------------------------------------------------------

export const LIVE_LATENCY = { min: 150, max: 350 } as const;
/** How long the scene lets time run after each edit (so "in flight" is visible), and the "wait" button. */
export const LIVE_STEP_MS = 400;
export const LIVE_WAIT_MS = 3000;
export const LIVE_SEED = 5;

export const liveConfig = (script: readonly Timed[], airplane: readonly Airplane[]): ScenarioConfig => ({
  seed: LIVE_SEED,
  strategy: 'merge',
  dedupe: true,
  latency: LIVE_LATENCY,
  loss: 0,
  duplicate: 0,
  skewMs: 0,
  script,
  airplane,
  randomFaults: false,
});

// ---- delivery faults ---------------------------------------------------------------------------

export interface Faults {
  delay: number;
  reorder: number;
  lossPct: number;
  dupPct: number;
  dedupe: boolean;
  blank: boolean;
}
export const FAULT_LIMITS = {
  delay: { min: 10, max: 1500, step: 10 },
  reorder: { min: 0, max: 1500, step: 10 },
  lossPct: { min: 0, max: 60, step: 5 },
  dupPct: { min: 0, max: 60, step: 5 },
} as const;
export const FAULT_SEED = 3;
export const FAULTS_UNTIL_MS = 90_000;

export const faultScript = (blank: boolean): Timed[] => [
  add(100, 'phone', 'Milk'),
  act(1000, 'phone', { kind: 'inc' }),
  act(1200, 'laptop', { kind: 'inc' }),
  ...(blank ? [act(2500, 'laptop', { kind: 'rename', pick: 0, title: '' })] : []),
];

export const faultConfig = (f: Faults, seed: number): ScenarioConfig => ({
  seed,
  strategy: 'merge',
  dedupe: f.dedupe,
  latency: { min: f.delay, max: f.delay + f.reorder },
  loss: f.lossPct / 100,
  duplicate: f.dupPct / 100,
  skewMs: 0,
  script: faultScript(f.blank),
  airplane: [],
  randomFaults: false,
});

// ---- the sync loop -----------------------------------------------------------------------------

export interface Loop {
  outageSec: number;
  edits: number;
  capSec: number;
}
export const LOOP_LIMITS = { outageSec: { min: 0, max: 40, step: 5 }, edits: { min: 1, max: 5, step: 1 }, capSec: { min: 2, max: 30, step: 1 } } as const;
export const LOOP_SEED = 4;
export const LOOP_OUTAGE_FROM_MS = 500;
export const LOOP_LATENCY = { min: 50, max: 150 } as const;
const LOOP_EDITS: Action[] = [{ kind: 'add', title: 'Eggs' }, { kind: 'tick', pick: 0 }, { kind: 'rename', pick: 0, title: 'Free-range eggs' }, { kind: 'inc' }, { kind: 'add', title: 'Tea' }];
const LOOP_EDIT_FROM_MS = 1000;
const LOOP_EDIT_GAP_MS = 400;
export const LOOP_AFTER_MS = 30_000;

export const loopScript = (edits: number): Timed[] => LOOP_EDITS.slice(0, edits).map((action, i) => act(LOOP_EDIT_FROM_MS + i * LOOP_EDIT_GAP_MS, 'laptop', action));
export const loopUntil = (l: Loop): number => LOOP_OUTAGE_FROM_MS + l.outageSec * 1000 + LOOP_AFTER_MS;

export const loopConfig = (l: Loop, seed: number): ScenarioConfig => ({
  seed,
  strategy: 'merge',
  dedupe: true,
  latency: LOOP_LATENCY,
  loss: 0,
  duplicate: 0,
  skewMs: 0,
  script: loopScript(l.edits),
  airplane: [],
  outage: l.outageSec > 0 ? [{ device: 'laptop', from: LOOP_OUTAGE_FROM_MS, to: LOOP_OUTAGE_FROM_MS + l.outageSec * 1000 }] : [],
  syncBaseMs: 1000,
  syncCapMs: l.capSec * 1000,
  randomFaults: false,
});
