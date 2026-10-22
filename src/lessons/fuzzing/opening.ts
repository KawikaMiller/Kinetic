import { DEFAULT_EXECUTIONS, type FuzzerKind } from './fuzzer';
import type { TargetOptions } from './target';

export type SceneId = 'race' | 'corpus' | 'crash' | 'oracle';

/** The seed every scene opens on: the lowest of the 200 tested seeds whose guided run first crashes between 5,000 and 8,000 executions, so the climb is visible across the plot (a test pins the choice). */
export const DEFAULT_SEED = 13;

/**
 * Seeds (of 200, at 20,000 guided byte-by-byte executions) that crash. Measured and pinned by a test: 163 with this
 * lesson's mutators, 79 with an independent fuzzer written for the review, so the figure measures this toy's tuning.
 */
export const SEEDS_THAT_CRASH = { guided: 163, independent: 79, of: 200 } as const;

export interface RaceState {
  seed: number;
  executions: number;
  magic: TargetOptions['magic'];
  /** Whose coverage the graph and the source panel show. */
  shown: FuzzerKind;
}

export interface CorpusState {
  seed: number;
  executions: number;
  selected: number;
}

export interface CrashState {
  seed: number;
  executions: number;
  /** The crash site whose largest input is minimised (null until the run's first bucket is picked). */
  site: number | null;
}

export interface OracleState {
  seed: number;
  executions: number;
  boundsCheck: boolean;
  /** The text in the try-this-input field. */
  hex: string;
}

/** Every scene's opening state, as pure functions so a test can switch through all of them and see none leaks into another. */
export const initialRace = (): RaceState => ({ seed: DEFAULT_SEED, executions: DEFAULT_EXECUTIONS, magic: 'bytewise', shown: 'guided' });
export const initialCorpus = (): CorpusState => ({ seed: DEFAULT_SEED, executions: DEFAULT_EXECUTIONS, selected: 0 });
export const initialCrash = (): CrashState => ({ seed: DEFAULT_SEED, executions: DEFAULT_EXECUTIONS, site: null });
/** A record with the right magic whose length byte says 9 but which carries one payload byte: a lying length. */
export const PROBE_DEFAULT = '4b 4e 54 43 09 01';
export const initialOracle = (): OracleState => ({ seed: DEFAULT_SEED, executions: DEFAULT_EXECUTIONS, boundsCheck: true, hex: PROBE_DEFAULT });

export const OPENING_SCENE: SceneId = 'race';
