import type { ReactNode } from 'react';
import type { Frame } from './types';

type State<F extends Frame> = Omit<F, 'say' | 'hold'>;

/**
 * Builds a step-player frame list by mutating a running state and snapshotting it.
 *
 *   const r = createRecorder<MyFrame>({ reads: 0, hot: null }, { transient: { hot: null } });
 *   r.set({ hot: 'root' }); r.snap(<>Read the root</>);
 *   r.close(<>Done in {r.get().reads} reads</>, 2);
 *   return r.frames;
 *
 * snap() does a shallow copy: clone nested arrays/objects yourself before changing them.
 * `transient` keys reset to their given values after every snap (one-frame flashes).
 *
 * Ending: close() adds the summary as a frame of its own, so the last step keeps its
 * narration. amendLast() replaces the last caption instead, for when that caption is a
 * shorter version of the summary; reach for it deliberately, never by default.
 */
export function createRecorder<F extends Frame>(initial: State<F>, opts: { transient?: Partial<State<F>> } = {}) {
  let state: State<F> = { ...initial };
  const frames: F[] = [];
  return {
    frames,
    get: () => state,
    set(patch: Partial<State<F>>) {
      state = { ...state, ...patch };
    },
    /** Apply `patch`, then push the current state as a frame with this caption. */
    snap(say?: ReactNode, hold?: number, patch?: Partial<State<F>>) {
      if (patch) state = { ...state, ...patch };
      frames.push({ ...state, say, hold } as F);
      if (opts.transient) state = { ...state, ...opts.transient };
    },
    /** Push the closing summary as its own frame (the current state, unchanged). */
    close(say: ReactNode, hold?: number) {
      frames.push({ ...state, say, hold } as F);
    },
    /**
     * Replace the last frame's caption (and hold). Only when that caption is a shorter
     * version of `say`; otherwise use close(), or the last step's narration is lost.
     */
    amendLast(say: ReactNode, hold?: number) {
      const last = frames[frames.length - 1];
      if (!last) return;
      last.say = say;
      if (hold !== undefined) last.hold = hold;
    },
  };
}

export type Recorder<F extends Frame> = ReturnType<typeof createRecorder<F>>;
