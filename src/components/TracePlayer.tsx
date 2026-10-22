import { useState, type ReactNode } from 'react';
import { traceFrames, traceSignature, type TraceFrame, type TraceStep } from '../core/traceFrames';
import { usePlayer } from '../core/usePlayer';
import { Transport } from './Transport';
import './tracePlayer.css';

export type { TraceStep } from '../core/traceFrames';

export interface TracePlayerProps<S> {
  /** The state before any step (frame 0). */
  initial: S;
  /** The counterexample: `explorePathSteps(violation.path)` or `traceRowSteps(verdict.trace)`. */
  steps: readonly TraceStep<S>[];
  /** What the state looks like at a frame; default is the state as JSON. */
  renderState?: (state: S, frame: TraceFrame<S>) => ReactNode;
  /** The caption and list text for frame 0 (default "start"). */
  startText?: string;
  /** Names a state for change detection (default JSON.stringify): the player rewinds only when this differs. */
  stateKey?: (state: S) => string;
  /** Accessible name for the list of steps. */
  label?: string;
  /** Bind Space and the arrow keys to this player (default true). */
  keyboard?: boolean;
}

const jsonKey = (v: unknown) => JSON.stringify(v);
const jsonView = (state: unknown) => <pre className="trace-state mono">{JSON.stringify(state, null, 1)}</pre>;

/**
 * A stepped counterexample: the list of actions with the current one marked, the state view for
 * that step, and play / step / scrub controls. It memoises its frames INTERNALLY, keyed on the
 * trace's value, so a caller may rebuild `steps` on every render without restarting the player
 * (a fresh array into `usePlayer` is the crash class AC-0/T4 #37 exists for).
 *
 * Clicking a step jumps to it; the Transport (and Space and the arrow keys) is the keyboard path.
 */
export function TracePlayer<S>({ initial, steps, renderState, startText, stateKey = jsonKey, label = 'Steps of the trace', keyboard }: TracePlayerProps<S>) {
  const signature = `${startText ?? ''}\u0002${traceSignature(initial, steps, stateKey)}`;
  const [memo, setMemo] = useState(() => ({ signature, frames: traceFrames(initial, steps, startText) }));
  let frames = memo.frames;
  if (memo.signature !== signature) {
    frames = traceFrames(initial, steps, startText);
    setMemo({ signature, frames });
  }
  const player = usePlayer(frames, { keyboard, autoplayOnChange: false });
  const view = renderState ?? jsonView;

  return (
    <div className="trace-player">
      <Transport player={player} />
      <ol className="trace-steps" aria-label={label}>
        {frames.map((f) => (
          <li key={f.index} className={`trace-step${f.index === player.index ? ' is-now' : ''}${f.index > player.index ? ' is-later' : ''}`}>
            <button type="button" tabIndex={-1} aria-current={f.index === player.index ? 'step' : undefined} onClick={() => player.seek(f.index)}>
              <span className="trace-n mono">{f.index}</span>
              {f.actor && <span className="chip trace-actor">{f.actor}</span>}
              <span className="trace-text">{f.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="trace-view" aria-live="polite">{view(player.frame.state, player.frame)}</div>
    </div>
  );
}
